import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

interface VoiceIndicatorProps {
    /** Current audio strength, 0..1. Drives the reactive ring. */
    level: number;
    /** Whether this participant is the one currently speaking. */
    speaking: boolean;
    label: string;
    sublabel: string;
    icon: ComponentType<{ className?: string }>;
    /** `emerald` marks the live user mic; `neutral` for the interviewer. */
    accent?: "neutral" | "emerald";
}

export function VoiceIndicator({ level, speaking, label, sublabel, icon: Icon, accent = "neutral" }: VoiceIndicatorProps) {
    const l = Math.max(0, Math.min(1, level));

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative grid size-28 place-items-center">
                {/* Reactive ring — scales and brightens with audio strength. */}
                <div
                    className={cn(
                        "absolute inset-0 rounded-full border transition-[transform,opacity] duration-100 ease-out",
                        accent === "emerald" ? "border-emerald-500" : "border-foreground",
                    )}
                    style={{ transform: `scale(${1 + l * 0.45})`, opacity: speaking ? 0.25 + l * 0.6 : 0.12 }}
                />
                <div
                    className={cn(
                        "grid size-20 place-items-center rounded-full border bg-card transition-colors duration-200",
                        speaking ? "text-foreground" : "text-muted-foreground",
                    )}
                >
                    <Icon className="size-6" />
                </div>
            </div>
            <div className="text-center">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{sublabel}</p>
            </div>
        </div>
    );
}
