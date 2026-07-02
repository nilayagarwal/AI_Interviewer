import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import axios from "axios";
import { ArrowRight, Loader2 } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { BACKEND_URL } from "@/lib/config";

function GithubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
    );
}

export function Form() {
    const [github, setGithub] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        const value = github.trim();
        if (!value) {
            setError("Enter your GitHub profile URL to continue.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, { github: value });
            navigate(`/interview/${res.data.id}`);
        } catch {
            setError("Couldn't start the interview. Check the URL and try again.");
            setLoading(false);
        }
    }

    return (
        <main className="grid min-h-screen place-items-center overflow-hidden px-6">
            <div className="w-full max-w-sm">
                <div className="mb-8 space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Interviewer</span>
                    <h1 className="text-2xl font-semibold tracking-tight">Practice a technical interview</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We read your public GitHub projects and run a short voice interview about what you&apos;ve built.
                    </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-3" noValidate>
                    <div className="relative">
                        <GithubMark className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={github}
                            onChange={(e) => {
                                setGithub(e.target.value);
                                if (error) setError(null);
                            }}
                            placeholder="github.com/your-username"
                            className="pl-9"
                            autoFocus
                            disabled={loading}
                            aria-invalid={!!error}
                            aria-describedby={error ? "github-error" : undefined}
                        />
                    </div>

                    {error && (
                        <p id="github-error" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="size-4 animate-spin" /> Starting…
                            </>
                        ) : (
                            <>
                                Start interview <ArrowRight className="size-4" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="mt-6 text-xs text-muted-foreground">Uses your microphone · Public repositories only</p>
            </div>
        </main>
    );
}
