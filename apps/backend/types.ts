import { z } from "zod/v4";

export const PreInterviewBody = z.object({
    github: z.string()
})
