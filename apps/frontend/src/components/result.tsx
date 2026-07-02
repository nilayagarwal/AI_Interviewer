import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
import { Bot, Loader2, RotateCcw, User } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface ResultData {
    transcript: { type: "Assistant" | "User"; content: string; createdAt: Date }[];
    score: number;
    feedback: string;
    status: "Done" | "InProgress" | "Pre";
}

export function Results() {
    const { interviewId } = useParams();
    const navigate = useNavigate();
    const [result, setResult] = useState<ResultData>({
        score: 0,
        feedback: "",
        transcript: [],
        status: "Pre",
    });

    useEffect(() => {
        const fetchResult = () =>
            axios.get(`${BACKEND_URL}/api/v1/result/${interviewId}`).then((response) => {
                setResult(response.data);
                return response.data.status as ResultData["status"];
            });

        fetchResult();
        const intervalId = setInterval(async () => {
            const s = await fetchResult();
            if (s === "Done") clearInterval(intervalId);
        }, 5000);

        return () => clearInterval(intervalId);
    }, [interviewId]);

    const done = result.status === "Done";

    return (
        <main className="min-h-screen">
            <header className="flex items-center justify-between border-b px-6 py-4">
                <span className="text-sm font-semibold tracking-tight">AI Interviewer</span>
                <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                    <RotateCcw className="size-4" />
                    New interview
                </Button>
            </header>

            {!done ? (
                <div className="grid min-h-[70vh] place-items-center px-6">
                    <div className="flex flex-col items-center gap-3 text-center">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        <p className="text-sm font-medium">Evaluating your interview</p>
                        <p className="text-xs text-muted-foreground">Scoring your answers — this usually takes a few seconds.</p>
                    </div>
                </div>
            ) : (
                <div className="mx-auto max-w-3xl space-y-10 px-6 py-10">
                    <section className="grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-stretch">
                        <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-6">
                            <div className="text-4xl font-semibold tracking-tight tabular-nums">
                                {result.score}
                                <span className="text-xl text-muted-foreground">/10</span>
                            </div>
                            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Score</p>
                        </div>
                        <div className="rounded-xl border bg-card p-6">
                            <h2 className="text-sm font-medium">Feedback</h2>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                {result.feedback || "No feedback was generated for this interview."}
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="mb-4 text-sm font-medium">Transcript</h2>
                        {result.transcript.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No conversation was recorded.</p>
                        ) : (
                            <div className="space-y-5">
                                {result.transcript.map((message, i) => (
                                    <div key={i} className="flex gap-3">
                                        <div
                                            className={cn(
                                                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border",
                                                message.type === "Assistant" ? "bg-card text-muted-foreground" : "bg-secondary text-secondary-foreground",
                                            )}
                                        >
                                            {message.type === "Assistant" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-muted-foreground">
                                                {message.type === "Assistant" ? "Interviewer" : "You"}
                                            </p>
                                            <p className="text-sm leading-relaxed">{message.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </main>
    );
}
