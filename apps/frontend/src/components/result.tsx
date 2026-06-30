import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useNavigate, useParams } from "react-router";
import { useEffect, useState } from "react";
interface ResultData {
    transcript: { type: "Assistant" | "User", content: string, createdAt: Date}[];
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

    return (
        <div>
            {result.status=="Done" && <div>
                Score - {result.score}
                Feedback - {result.feedback}

                Transcript- 
                    {result.transcript.map(x=><div>
                        {x.type}- {x.content}
                    </div>)
                    }
            </div>}
            
        </div>
    );
}