import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { KeyRound, Loader2, LogOut, Settings, X } from "lucide-react";
import { useShellStore } from "../../store/shell";
import { useSettingsStore } from "../../store/settings";

function GithubIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.01-2.13-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.02 2.79-.02 3.17 0 .31.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

type AuthTab = "device" | "pat";

interface DeviceSession {
  userCode: string;
  verificationUri: string;
  interval: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SettingsDialog() {
  const settingsOpen = useShellStore((s) => s.settingsOpen);
  const closeSettings = useShellStore((s) => s.closeSettings);
  const clientId = useSettingsStore((s) => s.githubClientId);
  const setClientId = useSettingsStore((s) => s.setGithubClientId);

  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [tab, setTab] = useState<AuthTab>("device");
  const [device, setDevice] = useState<DeviceSession | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [patInput, setPatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    if (!settingsOpen) return;
    setChecking(true);
    setError(null);
    setDevice(null);
    setAuthorizing(false);
    setPatInput("");
    (async () => {
      try {
        const saved = await invoke<string | null>("get_github_token");
        if (saved) {
          setToken(saved);
          const ok = await fetchLogin(saved);
          if (!ok) setToken(null);
        }
      } catch (e) {
        setError(typeof e === "string" ? e : "读取凭据失败");
      } finally {
        setChecking(false);
      }
    })();
    return () => {
      cancelRef.current = true;
    };
  }, [settingsOpen]);

  const fetchLogin = async (t: string): Promise<boolean> => {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        setError("token 无效或已过期");
        return false;
      }
      const data = (await res.json()) as { login: string };
      setLogin(data.login);
      setError(null);
      return true;
    } catch {
      setError("网络错误，无法验证 token");
      return false;
    }
  };

  const finishAuth = async (t: string) => {
    await invoke("store_github_token", { token: t });
    setToken(t);
    setDevice(null);
    setAuthorizing(false);
    setPatInput("");
    await fetchLogin(t);
  };

  const startDeviceFlow = async () => {
    if (!clientId.trim()) {
      setError("请先填写 GitHub OAuth App 的 Client ID");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: clientId.trim(),
          scope: "repo read:user",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(`获取验证码失败：${data.error_description || data.error}`);
        setBusy(false);
        return;
      }
      const session: DeviceSession = {
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        interval: Number(data.interval) || 5,
      };
      setDevice(session);
      setAuthorizing(true);
      await openUrl(data.verification_uri);
      setBusy(false);
      void pollDeviceFlow(session);
    } catch {
      setError("网络错误，无法连接 GitHub");
      setBusy(false);
    }
  };

  const pollDeviceFlow = async (session: DeviceSession) => {
    let interval = session.interval;
    while (!cancelRef.current) {
      await sleep(interval * 1000);
      if (cancelRef.current) return;
      try {
        const res = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            client_id: clientId.trim(),
            device_code: session.userCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });
        const data = await res.json();
        if (data.access_token) {
          await finishAuth(data.access_token);
          return;
        }
        if (data.error === "authorization_pending") continue;
        if (data.error === "slow_down") {
          interval += 5;
          continue;
        }
        setError(
          data.error === "access_denied"
            ? "你在浏览器中取消了授权"
            : data.error === "expired_token"
              ? "验证码已过期，请重新获取"
              : `授权失败：${data.error_description || data.error}`,
        );
        setDevice(null);
        setAuthorizing(false);
        return;
      } catch {
        if (cancelRef.current) return;
        setError("网络错误，轮询中断，请重新发起登录");
        setDevice(null);
        setAuthorizing(false);
        return;
      }
    }
  };

  const cancelDeviceFlow = () => {
    cancelRef.current = true;
    setDevice(null);
    setAuthorizing(false);
    setError(null);
  };

  const savePat = async () => {
    const t = patInput.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      await finishAuth(t);
    } catch (e) {
      setError(typeof e === "string" ? e : "保存凭据失败");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await invoke("delete_github_token");
      setToken(null);
      setLogin(null);
      setError(null);
    } catch (e) {
      setError(typeof e === "string" ? e : "删除凭据失败");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-8 w-full rounded-md border border-border-subtle bg-base px-2.5 text-[13px] text-fg-primary outline-none transition-colors duration-120 placeholder:text-fg-muted focus:border-accent";

  return (
    <AnimatePresence>
      {settingsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeSettings}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[560px] max-w-[90vw] rounded-lg border border-border-default bg-elevated shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-fg-primary">
                <Settings size={16} strokeWidth={1.5} className="text-accent" />
                设置
              </div>
              <button
                type="button"
                onClick={closeSettings}
                className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-hover hover:text-fg-primary"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <section>
                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-fg-primary">
                  <GithubIcon size={14} className="text-fg-secondary" />
                  GitHub 账户
                </div>

                {checking ? (
                  <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-base px-3 py-3 text-[12px] text-fg-muted">
                    <Loader2 size={13} className="animate-spin" />
                    正在读取系统凭据...
                  </div>
                ) : token ? (
                  <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-base px-3 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15">
                      <GithubIcon size={15} className="text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-fg-primary">
                        {login ? `@${login}` : "已保存 token"}
                      </div>
                      <div className="text-[11px] text-fg-muted">
                        凭据存储于系统钥匙串
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={logout}
                      disabled={busy}
                      className="flex h-7 items-center gap-1.5 rounded-md border border-danger/50 px-2.5 text-[12px] text-danger transition-colors duration-120 hover:bg-danger/10 disabled:opacity-50"
                    >
                      <LogOut size={12} strokeWidth={1.5} />
                      退出登录
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-1 rounded-md border border-border-subtle bg-base p-0.5">
                      <button
                        type="button"
                        onClick={() => setTab("device")}
                        className={`flex h-6 flex-1 items-center justify-center gap-1.5 rounded-sm text-[12px] transition-colors duration-120 ${
                          tab === "device"
                            ? "bg-hover text-fg-primary"
                            : "text-fg-muted"
                        }`}
                      >
                        设备授权登录
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("pat")}
                        className={`flex h-6 flex-1 items-center justify-center gap-1.5 rounded-sm text-[12px] transition-colors duration-120 ${
                          tab === "pat"
                            ? "bg-hover text-fg-primary"
                            : "text-fg-muted"
                        }`}
                      >
                        <KeyRound size={11} strokeWidth={1.5} />
                        Personal Access Token
                      </button>
                    </div>

                    {tab === "device" ? (
                      device ? (
                        <div className="flex flex-col items-center gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-4">
                          <div className="text-[12px] text-fg-secondary">
                            在浏览器中输入以下验证码
                          </div>
                          <div className="font-mono text-[26px] font-semibold tracking-[0.2em] text-fg-primary select-all">
                            {device.userCode}
                          </div>
                          <div className="flex items-center gap-1.5 text-[12px] text-fg-muted">
                            <Loader2 size={12} className="animate-spin text-accent" />
                            等待浏览器中完成授权...
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openUrl(device.verificationUri)}
                              className="text-[12px] text-accent hover:underline"
                            >
                              重新打开授权页
                            </button>
                            <button
                              type="button"
                              onClick={cancelDeviceFlow}
                              className="text-[12px] text-fg-muted hover:text-fg-primary"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[12px] text-fg-secondary">
                              OAuth App Client ID
                            </span>
                            <input
                              type="text"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                              placeholder="在 GitHub Settings → Developer settings 创建"
                              className={`${inputClass} font-mono text-[12px]`}
                              disabled={authorizing || busy}
                            />
                          </label>
                          <div className="text-[11px] leading-relaxed text-fg-muted">
                            需自行创建 GitHub OAuth App（无需
                            secret），回调地址可留空；或切换到 PAT 方式。
                          </div>
                          <button
                            type="button"
                            onClick={startDeviceFlow}
                            disabled={busy || authorizing || !clientId.trim()}
                            className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
                          >
                            {busy && <Loader2 size={13} className="animate-spin" />}
                            使用浏览器登录 GitHub
                          </button>
                        </>
                      )
                    ) : (
                      <>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[12px] text-fg-secondary">
                            Personal Access Token
                          </span>
                          <input
                            type="password"
                            value={patInput}
                            onChange={(e) => setPatInput(e.target.value)}
                            placeholder="ghp_... 或 github_pat_..."
                            className={`${inputClass} font-mono text-[12px]`}
                            disabled={busy}
                            onKeyDown={(e) =>
                              e.key === "Enter" && !busy && savePat()
                            }
                          />
                        </label>
                        <div className="text-[11px] leading-relaxed text-fg-muted">
                          建议勾选 repo、read:user 权限；token 仅保存到系统钥匙串，不写入任何文件。
                        </div>
                        <button
                          type="button"
                          onClick={savePat}
                          disabled={busy || !patInput.trim()}
                          className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-white transition-colors duration-120 hover:bg-accent-hover disabled:opacity-50"
                        >
                          {busy && <Loader2 size={13} className="animate-spin" />}
                          保存并验证
                        </button>
                      </>
                    )}
                  </div>
                )}

                {error && (
                  <div className="mt-2 whitespace-pre-wrap rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger">
                    {error}
                  </div>
                )}
              </section>

              <section className="border-t border-border-subtle pt-3">
                <div className="mb-2 text-[13px] font-medium text-fg-primary">
                  快捷键
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                  {[
                    ["⌘/Ctrl + B", "切换侧边栏"],
                    ["⌘/Ctrl + J", "切换改动抽屉"],
                    ["⌘/Ctrl + ⇧ + T", "切换主题"],
                    ["⌘/Ctrl + Enter", "提交改动"],
                    ["⌘/Ctrl + R", "Fetch 当前仓库"],
                    ["⌘/Ctrl + ⇧ + R", "Pull 当前仓库"],
                    ["⌘/Ctrl + ⇧ + U", "Push 当前仓库"],
                    ["⌘/Ctrl + ,", "打开设置"],
                  ].map(([keys, desc]) => (
                    <div key={keys} className="flex justify-between gap-2">
                      <span className="font-mono text-[11px] text-fg-secondary">
                        {keys}
                      </span>
                      <span className="text-fg-muted">{desc}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
