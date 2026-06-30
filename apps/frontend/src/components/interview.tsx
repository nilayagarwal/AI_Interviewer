import { BACKEND_URL } from "@/lib/config";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "./ui/button";

type Status = "connecting" | "live" | "ending";
type TranscriptEntry = { type: "User" | "Assistant"; content: string };

// Grace period after muting the mic before tearing down the call, so the
// candidate's final utterance has time to finish transcribing and arrive
// on the data channel before the connection closes.
const END_CALL_GRACE_PERIOD_MS = 3000;

export function Interview() {
    const { interviewId } = useParams();
    const navigate = useNavigate();

    const [status, setStatus] = useState<Status>("connecting");
    const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            // Play remote audio from the model.
            audioRef.current = document.createElement("audio");
            audioRef.current.autoplay = true;
            pc.ontrack = (e) => (audioRef.current!.srcObject = e.streams[0]!);

            // Add local audio track for microphone input.
            const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (cancelled) {
                ms.getTracks().forEach((t) => t.stop());
                return;
            }
            streamRef.current = ms;
            pc.addTrack(ms.getTracks()[0]!);

            // Data channel carries the same realtime events our backend
            // sideband receives — including transcription as soon as it's
            // ready — so we can show the transcript live, not just after
            // the call ends.
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

            // Start the session using the Session Description Protocol (SDP).
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
        })();

        // Covers navigating away without clicking "End Interview" — no
        // grace period here, but the connection still closes cleanly.
        return () => {
            cancelled = true;
            pcRef.current?.close();
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, [interviewId]);

    async function endInterview() {
        if (status === "ending") return;
        setStatus("ending");

        // Stop sending mic audio now, but keep the connection open briefly
        // so the last utterance's transcription can still arrive.
        streamRef.current?.getTracks().forEach((t) => (t.enabled = false));
        await new Promise((resolve) => setTimeout(resolve, END_CALL_GRACE_PERIOD_MS));

        pcRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        navigate(`/result/${interviewId}`);
    }

    return (
        <div className="p-6">
            <audio autoPlay ref={(el) => { if (el) audioRef.current = el; }}></audio>

            <h2>
                {status === "connecting" ? "Connecting…" : status === "ending" ? "Wrapping up…" : "Interview live"}
            </h2>

            <div className="my-4 space-y-2">
                {transcript.map((entry, i) => (
                    <div key={i}>
                        <strong>{entry.type === "User" ? "You" : "Interviewer"}:</strong> {entry.content}
                    </div>
                ))}
            </div>

            <Button onClick={endInterview} disabled={status === "ending"}>
                {status === "ending" ? "Ending..." : "End Interview"}
            </Button>
        </div>
    );
}
