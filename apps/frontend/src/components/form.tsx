import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
export function Form() {

  const [github, setGithub] = useState("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false)
  async function onSubmit() {
    if (!github) {
      //todo: add more validation later
      toast("Please provide github urls")
      return;
    }
    setLoading(true);
    const response= await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
      github
    })

    navigate(`/interview/${response.data.id}`)

  }

  return (
    <div className="h-screen w-screen flex justify-center items-center">
      <div>
        <h2 className="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0">
          Interview Prep
        </h2>
        <div className="p-4" >
          <Input placeholder="Github URL" onChange={(e) => setGithub(e.target.value)} />
        </div>
        <div className="flex justify-center" >
          <Button disabled={loading} onClick={onSubmit} >{loading ? "Starting Interview" : "Start Interview"}</Button>
        </div>
      </div>
    </div>
  );
}