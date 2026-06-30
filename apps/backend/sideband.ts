import WebSocket from "ws";
import { prisma } from "./db";

export async function initSideband(callId: string, interviewId: string) {
    const url = "wss://api.openai.com/v1/realtime?call_id=" + callId;
    const ws = new WebSocket(url, {
        headers: {
            Authorization: "Bearer " + process.env.OPENAI_KEY,
        },
    });

    const interview = await prisma.interview.findFirst({
        where: {
            id: interviewId
        }
    })


    ws.on("open", function open() {
        console.log("Sideband connected for interview", interviewId);

        // Enable input audio transcription so we receive the candidate's words,
        // and set the interviewer instructions.
        ws.send(
            JSON.stringify({
                type: "session.update",
                session: {
                    type: "realtime",
                    instructions: `You are a technical interviewer assessing this candidate's computer-science skills, using their GitHub projects as the basis for your questions.

Conduct the interview like a real human, one step at a time:
- Ask EXACTLY ONE question per turn, then stop and wait for the candidate's spoken answer. NEVER bundle multiple questions into a single turn (no "First... Second... Finally...").
- Work through their repositories ONE AT A TIME. Ask one or two questions about the current project — plus a natural follow-up based on what they actually said — before moving on to the next repository.
- Keep each question short and conversational (one or two sentences).
- After they answer, briefly acknowledge it, then ask your next single question.
- Speak in English only.

Begin by introducing yourself in one sentence, then ask your first single question about their first project.

Here are the candidate's GitHub repositories:
${interview?.githubMetadata}
                    `,
                    // Without this, OpenAI never transcribes the candidate's audio,
                    // so no input_audio_transcription.completed events are ever emitted.
                    audio: {
                        input: {
                            transcription: {
                                model: "gpt-4o-transcribe",
                                language: "en",
                            },
                        },
                    },
                },
            })
        );
    });

    ws.on("message", async function incoming(message) {
        try {
            const parsedMessage = JSON.parse(message.toString());

            // The candidate's spoken answer
            if (parsedMessage.type === "conversation.item.input_audio_transcription.completed") {
                const transcript = parsedMessage.transcript?.trim();
                if (transcript) {
                    await prisma.message.create({
                        data: { message: transcript, type: "User", interviewId },
                    });
                }
            }

            // The AI interviewer's response
            if (parsedMessage.type === "response.done") {
                
                const transcript = extractAssistantTranscript(parsedMessage);
                if (transcript) {
                    await prisma.message.create({
                        data: { message: transcript, type: "Assistant", interviewId },
                    });
                }
            }
        } catch (e) {
            console.error("Sideband message error for interview", interviewId, e);
        }
    });

    ws.on("error", function error(err) {
        console.error("Sideband error for interview", interviewId, err);
    });

    ws.on("close", function close(code) {
        console.log("Sideband closed for interview", interviewId, "code", code);
    });
}

// response.done nests the assistant transcript under response.output[].content[].
function extractAssistantTranscript(responseDone: any): string {
    const output = responseDone.response?.output ?? [];
    const parts: string[] = [];
    for (const item of output) {
        for (const content of item.content ?? []) {
            if (content.transcript) parts.push(content.transcript);
            else if (content.text) parts.push(content.text);
        }
    }
    return parts.join(" ").trim();
    
}
