import mentisMark from "../assets/mentis-mark-transparent.png";

export function Panel({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action ? <button onClick={onAction}>{action}</button> : null}
      </div>
      {children}
    </section>
  );
}

export function AiAvatar() {
  return (
    <span className="ai-avatar" aria-hidden="true">
      <img src={mentisMark} alt="" />
    </span>
  );
}

export function TypingIndicator() {
  return (
    <article className="message assistant">
      <AiAvatar />
      <div className="message-content typing-content" aria-label="AI 正在输入">
        <span />
        <span />
        <span />
      </div>
      <time>10:21</time>
    </article>
  );
}

export function TinyIcon({ name }: { name: "spark" | "plan" | "calendar" | "book" | "bell" | "chat" }) {
  const paths = {
    spark: "M12 3l2 6 6 3-6 3-2 6-2-6-6-3 6-3z",
    plan: "M5 5h14v14H5zM8 9h8M8 13h5",
    calendar: "M5 5h14v15H5zM8 3v4M16 3v4M5 10h14",
    book: "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4zM5 4v12",
    bell: "M6 17h12l-1-2v-4a5 5 0 0 0-10 0v4zM10 20a2 2 0 0 0 4 0",
    chat: "M4 5h16v11H8l-4 4z",
  };
  return (
    <svg viewBox="0 0 24 24">
      <path d={paths[name]} />
    </svg>
  );
}

export function PendingRecommendation({ title, description }: { title: string; description: string }) {
  return (
    <div className="pending-recommendation">
      <span>待生成</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
