import { BACKEND_URL } from "@/lib/config";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, Mic, PhoneOff } from "lucide-react";
import { Button } from "./ui/button";
import { VoiceIndicator } from "./VoiceIndicator";
import { cn } from "@/lib/utils";

type Status = "connecting" | "live" | "ending";
type TranscriptEntry = { type: "User" | "Assistant"; content: string };

// Grace period after muting the mic before tearing down the call, so the
// candidate's final utterance has time to finish transcribing and arrive
// on the data channel before the connection closes.
const END_CALL_GRACE_PERIOD_MS = 3000;

// Returns a getter for a stream's current 0..1 loudness (RMS). Used only to
// drive the on-screen audio indicators — it does not touch the call itself.
function createMeter(ctx: AudioContext, stream: MediaStream) {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    return () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128;
            sum += v * v;
        }
        // Boost + clamp so ordinary speech fills most of the 0..1 range.
        return Math.min(1, Math.sqrt(sum / data.length) * 3.2);
    };
}

export function Interview() {
    const { interviewId } = useParams();
    const navigate = useNavigate();

    const [status, setStatus] = useState<Status>("connecting");
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
    const [levels, setLevels] = useState({ ai: 0, user: 0 });

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            let aiMeter: (() => number) | null = null;
            let userMeter: (() => number) | null = null;

            // Play remote audio from the model, and meter it for the indicator.
            audioRef.current = document.createElement("audio");
            audioRef.current.autoplay = true;
            pc.ontrack = (e) => {
                const stream = e.streams[0]!;
                audioRef.current!.srcObject = stream;
                aiMeter = createMeter(ctx, stream);
            };

            // Add local audio track for microphone input.
            const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (cancelled) {
                ms.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = ms;
            pc.addTrack(ms.getTracks()[0]!);
            userMeter = createMeter(ctx, ms);

            // Data channel carries the same realtime events our backend
            // sideband receives — including transcription as soon as it's ready.
            const dc = pc.createDataChannel("oai-events");
            dcRef.current = dc;
            dc.addEventListener("message", (e) => {
                const event = JSON.parse(e.data);

                if (event.type === "conversation.item.input_audio_transcription.completed") {
                    const text = event.transcript?.trim();
                    if (text) setTranscript((t) => [...t, { type: "User", content: text }]);
                }

                if (event.type === "response.done") {
                    const output = event.response?.output ?? [];
                    const parts: string[] = [];
                    for (const item of output) {
                        for (const content of item.content ?? []) {
                            if (content.transcript) parts.push(content.transcript);
                            else if (content.text) parts.push(content.text);
                        }
                    }
                    const text = parts.join(" ").trim();
                    if (text) setTranscript((t) => [...t, { type: "Assistant", content: text }]);
                }
            });

            // SDP handshake with the backend.
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const sdpResponse = await fetch(`${BACKEND_URL}/api/v1/session/${interviewId}`, {
                method: "POST",
                body: offer.sdp,
                headers: { "Content-Type": "application/sdp" },
            });

            const answer = { type: "answer" as const, sdp: await sdpResponse.text() };
            if (cancelled) return;
            await pc.setRemoteDescription(answer);

            if (cancelled) return;
            setStatus("live");

            // One animation loop drives both audio indicators.
            ctx.resume().catch(() => {});
            const tick = () => {
                setLevels({ ai: aiMeter ? aiMeter() : 0, user: userMeter ? userMeter() : 0 });
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        })();

        // Covers navigating away without clicking "End interview".
        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            audioCtxRef.current?.close().catch(() => {});
            pcRef.current?.close();
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, [interviewId]);

    async function endInterview() {
        if (status === "ending") return;
        setStatus("ending");
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        // Stop sending mic audio now, but keep the connection open briefly so
        // the last utterance's transcription can still arrive.
        streamRef.current?.getTracks().forEach((t) => (t.enabled = false));
        await new Promise((resolve) => setTimeout(resolve, END_CALL_GRACE_PERIOD_MS));

        audioCtxRef.current?.close().catch(() => {});
        pcRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        navigate(`/result/${interviewId}`);
    }

    const questions = transcript.filter((t) => t.type === "Assistant");
    const aiSpeaking = status === "live" && levels.ai > 0.06 && levels.ai >= levels.user;
    const userSpeaking = status === "live" && levels.user > 0.06 && levels.user > levels.ai;

    const stageCaption =
        status === "connecting"
            ? "Setting up your interview…"
            : status === "ending"
              ? "Wrapping up — saving your answers"
              : aiSpeaking
                ? "Interviewer is speaking"
                : userSpeaking
                  ? "Listening to you"
                  : "Waiting for the next question";

    return (
        <main className="flex h-screen w-screen flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tracking-tight">AI Interviewer</span>
                    <span className="h-4 w-px bg-border" />
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="relative flex size-2">
                            {status === "live" && (
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                            )}
                            <span
                                className={cn(
                                    "relative inline-flex size-2 rounded-full",
                                    status === "live" ? "bg-emerald-500" : "bg-amber-500",
                                )}
                            />
                        </span>
                        {status === "connecting" ? "Connecting" : status === "ending" ? "Wrapping up" : "Live"}
                    </div>
                </div>

                <Button variant="outline" size="sm" onClick={endInterview} disabled={status === "ending"}>
                    {status === "ending" ? <Loader2 className="size-4 animate-spin" /> : <PhoneOff className="size-4" />}
                    {status === "ending" ? "Ending" : "End interview"}
                </Button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
                {/* Stage: the two audio indicators. */}
                <section className="flex flex-1 flex-col items-center justify-center gap-10 p-8">
                    <div className="flex items-center gap-14 sm:gap-24">
                        <VoiceIndicator
                            level={levels.ai}
                            speaking={aiSpeaking}
                            label="Interviewer"
                            sublabel={aiSpeaking ? "Speaking" : "Listening"}
                            icon={Bot}
                        />
                        <VoiceIndicator
                            level={levels.user}
                            speaking={userSpeaking}
                            label="You"
                            sublabel={userSpeaking ? "Speaking" : "Mic on"}
                            icon={Mic}
                            accent="emerald"
                        />
                    </div>
                    <p className="h-5 text-sm text-muted-foreground">{stageCaption}</p>
                </section>

                {/* Questions asked by the interviewer. */}
                <aside className="flex min-h-0 flex-1 flex-col border-t md:w-96 md:flex-none md:border-t-0 md:border-l">
                    <div className="border-b px-6 py-4">
                        <p className="text-sm font-medium">Questions</p>
                        <p className="text-xs text-muted-foreground">From the interviewer</p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        {questions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Questions will appear here as the interviewer asks them.
                            </p>
                        ) : (
                            <ol className="space-y-5">
                                {questions.map((q, i) => (
                                    <li key={i} className="flex gap-3">
                                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">
                                            {i + 1}
                                        </span>
                                        <p className="text-sm leading-relaxed">{q.content}</p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </aside>
            </div>
        </main>
    );
}
