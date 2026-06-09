"use client";

import { useState } from "react";

export function ModelRuntimePanel() {
  const [output, setOutput] = useState("等待调用...");
  const [isLoading, setIsLoading] = useState(false);

  async function runModel() {
    setIsLoading(true);
    setOutput("调用中...");

    try {
      const response = await fetch("/api/model-runtime", { method: "POST" });

      if (response.body === null) {
        throw new Error("模型接口没有返回流式响应体");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let nextOutput = "";

      setOutput("");

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        nextOutput += decoder.decode(value, { stream: true });
        setOutput(nextOutput);
      }

      nextOutput += decoder.decode();
      setOutput(nextOutput);
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "模型调用失败");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="panel">
        <div className="heading">
          <span>Model Runtime + Core Abstractions Demo</span>
          <h1>AI Core 调试输出</h1>
        </div>

        <button className="button" type="button" disabled={isLoading} onClick={runModel}>
          {isLoading ? "调用中" : "调用模型"}
        </button>

        <pre className="output">{output}</pre>
      </section>
    </main>
  );
}
