import type { ReactNode } from "react";

const tones = {
  error: "border-danger/30 bg-danger-bg text-danger",
  success: "border-success/30 bg-success-bg text-success",
  warning: "border-warning/30 bg-warning-bg text-warning",
  info: "border-teal-500/30 bg-teal-100 text-text",
};

interface AlertProps {
  tone?: keyof typeof tones;
  title?: string;
  messages?: string[];
  children?: ReactNode;
}

export function Alert({ tone = "info", title, messages, children }: AlertProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {messages && messages.length === 1 && <p>{messages[0]}</p>}
      {messages && messages.length > 1 && (
        <ul className="list-disc pl-5">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}
