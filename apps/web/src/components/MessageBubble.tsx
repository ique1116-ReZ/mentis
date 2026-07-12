import { useId, useState } from "react";
import { evidence } from "../data";
import { AiAvatar } from "./Shared";
import type { ChatMessage, ChatOption, ChatRecommendedAction } from "../types";

export function MessageBubble({
  disabled = false,
  message,
  onAddRecommendedActions,
  isActionInPlan,
  onSelectOption,
  onSubmitSupplement,
}: {
  disabled?: boolean;
  message: ChatMessage;
  onAddRecommendedActions?: (actions: ChatRecommendedAction[]) => void;
  isActionInPlan?: (action: ChatRecommendedAction) => boolean;
  onSelectOption?: (option: ChatOption) => void;
  onSubmitSupplement?: (content: string) => void;
}) {
  const [supplement, setSupplement] = useState("");
  const supplementId = useId();
  const isAssistant = message.role === "assistant";
  const options = isAssistant && Array.isArray(message.options) ? message.options : [];
  const recommendedActions = isAssistant && Array.isArray(message.recommendedActions) ? message.recommendedActions : [];
  const canSupplement = options.length > 0;
  return (
    <article className={isAssistant ? "message assistant" : "message user"}>
      {isAssistant ? <AiAvatar /> : null}
      <div className="message-content">
        {message.content.split("\n").map((line, index) => (
          <p key={`${line}-${index}`}>{line || " "}</p>
        ))}
        {isAssistant && message.question ? <p className="message-question">{message.question}</p> : null}
        {options.length > 0 ? (
          <div className="message-options">
            {options.map((option) => (
              <button
                className="message-option"
                disabled={disabled}
                key={option.id}
                onClick={() => onSelectOption?.(option)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {recommendedActions.length > 0 ? (
          <div className="recommended-actions">
            {recommendedActions.length > 1 ? (
              <button
                className="action-add-all"
                disabled={disabled}
                onClick={() =>
                  onAddRecommendedActions?.(recommendedActions.filter((action) => !isActionInPlan?.(action)))
                }
                type="button"
              >
                全部加入今日计划
              </button>
            ) : null}
            {recommendedActions.map((action) => (
              <article className="recommended-action-card" key={action.actionId ?? action.title}>
                <div>
                  <strong>{action.title}</strong>
                  <span>{action.phase} · {action.defaultDosage}</span>
                </div>
                {isActionInPlan?.(action) ? (
                  <span className="action-added">已在计划中</span>
                ) : (
                  <button disabled={disabled} onClick={() => onAddRecommendedActions?.([action])} type="button">
                    加入今日计划
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : null}
        {canSupplement ? (
          <form
            className="message-supplement"
            onSubmit={(event) => {
              event.preventDefault();
              const content = supplement.trim();
              if (!content || disabled) {
                return;
              }
              onSubmitSupplement?.(content);
              setSupplement("");
            }}
          >
            <label htmlFor={supplementId}>补充描述</label>
            <div className="message-supplement-row">
              <input
                disabled={disabled}
                id={supplementId}
                onChange={(event) => setSupplement(event.target.value)}
                placeholder="如果没有合适选项，可以自己补充"
                value={supplement}
              />
              <button disabled={disabled || !supplement.trim()} type="submit">
                发送
              </button>
            </div>
          </form>
        ) : null}
        {isAssistant && message.content.includes("参考依据") ? (
          <div className="citation-actions">
            {evidence.citations.slice(0, 2).map((citation, index) => (
              <button key={citation.label}>证据 {index + 1}</button>
            ))}
          </div>
        ) : null}
      </div>
      {!isAssistant ? <span className="avatar photo">张</span> : null}
      <time>10:21</time>
    </article>
  );
}
