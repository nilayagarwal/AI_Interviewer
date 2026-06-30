import express from "express";
import { PreInterviewBody } from "./types";
import axios from "axios";
import { scrapeGithub } from "./scrapper/github";
import cors from "cors";
import { prisma } from "./db"
import { initSideband } from "./sideband";
import { calculateResult } from "./result";
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.text({ type: ["application/sdp", "text/plain"] })); //sdp which comes form openai which is not json but text



app.post("/api/v1/pre-interview", async (req, res) => {
  try {
    const { success, data } = PreInterviewBody.safeParse(req.body);

    if (!success) {
      res.status(411).json({
        message: "Incorrect Body"
      })
      return;
    }
    // Todo: url validation use SLM here
    const githubUrl = data.github.endsWith("/") ? data.github.slice(0, -1) : data.github;

    const githubUsername = githubUrl.split("/").pop()!;

    const githubData = await scrapeGithub(githubUsername);

    const interview = await prisma.interview.create({
      data: {
        githubMetadata: JSON.stringify(githubData),
        status: "Pre"
      }
    })

    console.log(githubData);
    res.json({ id: interview.id })
  }

  catch (e) {
    console.error("Error in pre-interview:", e);
    res.status(500).json({ message: "Internal server error" });
  }
})

app.post("/api/v1/session/:interviewId", async(req,res) =>{
  //this has which model we use and what audio is in output
  const sessionConfig = JSON.stringify({
    type: "realtime",
    model: "gpt-realtime-2",
    audio: { output: { voice: "marin" } },
  });

  const fd = new FormData();
  fd.set("sdp", req.body); 
  fd.set("session", sessionConfig);
  // req to open ai to send user sdp and get back open ai sdp
  // user sdp comes from req.body
  try {
    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_KEY}`,
        "OpenAI-Safety-Identifier": "hashed-user-id",
      },
      body: fd,  //sends user sdp to openai
    });
    // Location: /v1/realtime/calls/rtc_123456
    const location = sdpResponse.headers.get("Location");
    const callId = location?.split("/").pop();
    if (!callId) {
      console.error("No call_id returned from OpenAI");
      res.status(502).json({ error: "No call_id from OpenAI" });
      return;
    }

    // Send back the SDP we received from the OpenAI REST API
    const sdp = await sdpResponse.text();
    initSideband(callId, req.params.interviewId);
    res.send(sdp);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
})

app.post("/api/v1/session/user/response/:interviewId", async (req, res) => {
  const { message } = req.body;
  await prisma.message.create({
    data: {
        interviewId: req.params.interviewId!,
        type: "User",
        message: message
    }
  });

  res.json({message: "Message saved"});
})


app.get("/api/v1/result/:interviewId", async (req, res) => {
  const interview = await prisma.interview.findFirst({
    where: {
      id: req.params.interviewId
    },
    include: {
      conversations: true
    }
  })

  if (!interview) {
    res.status(411).json({
      message: "Interview not found"
    })
    return 
  }

  

  res.json({
    score: interview?.score,
    feedback: interview?.feedback,
    transcript: interview?.conversations.map(c => ({
      type: c.type,
      content: c.message,
      createdAt: c.createdAt
    })),
    status: interview.status
  });
  //todo:should add some sort of lock here
  if (interview.status != "Done") {
    try {
      const result = await calculateResult(interview.conversations);

      await prisma.interview.update({
        where: {
          id: req.params.interviewId
        },
        data: {
          status: "Done",
          feedback: result.feedback,
          score: result.score
        }
      });
    } catch (e) {
      console.error("Error scoring interview", req.params.interviewId, e);
    }
  }
})


app.listen(3001);

