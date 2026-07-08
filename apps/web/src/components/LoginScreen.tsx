import { useState } from "react";
import rezLogo from "../assets/rez-logo.png";
import { clientBuildId } from "../buildInfo";
import type { RegisterInput } from "../types";

export function LoginScreen({
  onLogin,
  onRegister,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (input: RegisterInput) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountRole, setAccountRole] = useState<"user" | "clinician">("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("ReZ");
  const [heightCm, setHeightCm] = useState("175");
  const [weightKg, setWeightKg] = useState("68");
  const [discipline, setDiscipline] = useState("运动康复师");
  const [credentialSummary, setCredentialSummary] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const isRegistering = mode === "register";

  return (
    <main className="login-page" data-build-id={clientBuildId}>
      <section className="login-shell">
        <div className="login-brand">
          <div className="brand-mark">
            <img src={rezLogo} alt="Mentis Rehab" />
          </div>
          <div>
            <strong>Mentis Rehab</strong>
            <span>powered by ReZ</span>
          </div>
        </div>

        <div className="login-copy">
          <h1>{isRegistering ? "创建账号" : "运动康复 AI 工作台"}</h1>
          <p>{isRegistering ? "选择患者或康复师/医生身份。不同角色登录后会进入不同面板。" : "患者进入训练与问诊，康复师进入咨询与计划管理。"}</p>
        </div>

        <div className="role-switch" aria-label="登录角色">
          <button className={!isRegistering ? "active" : ""} onClick={() => setMode("login")} type="button">登录</button>
          <button className={isRegistering ? "active" : ""} onClick={() => setMode("register")} type="button">注册</button>
        </div>

        <form
          className="login-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setIsLoggingIn(true);
            const action = isRegistering
              ? onRegister({
                  accountRole,
                  username: username.trim(),
                  password,
                  inviteCode: inviteCode.trim(),
                  displayName: displayName.trim(),
                  heightCm: heightCm.trim(),
                  weightKg: weightKg.trim(),
                  discipline: discipline.trim(),
                  credentialSummary: credentialSummary.trim(),
                  organizationName: organizationName.trim(),
                })
              : onLogin(username.trim(), password);
            action
              .catch((error) =>
                setError(
                  error instanceof Error && error.message
                    ? error.message
                    : isRegistering
                      ? "注册失败，请检查邀请码、网络或后端服务。"
                      : "登录失败，请检查账号密码或后端服务。",
                ),
              )
              .finally(() => setIsLoggingIn(false));
          }}
        >
          <label>
            用户名
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            密码
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>
          {isRegistering ? (
            <>
              <div className="role-switch account-role-switch" aria-label="注册身份">
                <button
                  className={accountRole === "user" ? "active" : ""}
                  onClick={() => setAccountRole("user")}
                  type="button"
                >
                  患者
                </button>
                <button
                  className={accountRole === "clinician" ? "active" : ""}
                  onClick={() => setAccountRole("clinician")}
                  type="button"
                >
                  康复师/医生
                </button>
              </div>
              <label>
                邀请码
                <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
              </label>
              <label>
                昵称
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <div className="form-pair">
                <label>
                  身高 cm
                  <input value={heightCm} onChange={(event) => setHeightCm(event.target.value)} inputMode="numeric" />
                </label>
                <label>
                  体重 kg
                  <input value={weightKg} onChange={(event) => setWeightKg(event.target.value)} inputMode="decimal" />
                </label>
              </div>
              {accountRole === "clinician" ? (
                <>
                  <label>
                    专业方向
                    <input value={discipline} onChange={(event) => setDiscipline(event.target.value)} />
                  </label>
                  <label>
                    资质摘要
                    <input
                      value={credentialSummary}
                      onChange={(event) => setCredentialSummary(event.target.value)}
                      placeholder="例如：物理治疗师，运动损伤方向 5 年"
                    />
                  </label>
                  <label>
                    所属机构
                    <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
                  </label>
                </>
              ) : null}
            </>
          ) : null}
          {error ? <p className="login-error">{error}</p> : null}
          <button
            className="login-submit"
            disabled={isLoggingIn || !username.trim() || !password || (isRegistering && !inviteCode.trim())}
            type="submit"
          >
            {isLoggingIn ? "处理中..." : isRegistering ? "保存并进入" : "登录进入"}
          </button>
        </form>
      </section>
    </main>
  );
}
