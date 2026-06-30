import "../styles/globals.css"
import { Form } from "@/components/form";
import { useState } from "react";
import { Interview } from "@/components/interview";
import { Results } from "@/components/result";
import {  BrowserRouter, Routes ,Route} from "react-router";

export function App() {
  const [page, setPage] = useState<"form" | "interview" | "results">("form");
  return (
    
    <BrowserRouter>
      <Routes>
        <Route path= "/" element={<Form/>}/>
        <Route path= "/interview/:interviewId" element={<Interview/>}/>
        <Route path= "/result/:interviewId" element={<Results/>}/>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
