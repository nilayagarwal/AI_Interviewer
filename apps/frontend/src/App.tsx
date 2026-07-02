import "../styles/globals.css";
import { BrowserRouter, Routes, Route } from "react-router";
import { Form } from "@/components/form";
import { Interview } from "@/components/interview";
import { Results } from "@/components/result";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Form />} />
        <Route path="/interview/:interviewId" element={<Interview />} />
        <Route path="/result/:interviewId" element={<Results />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
