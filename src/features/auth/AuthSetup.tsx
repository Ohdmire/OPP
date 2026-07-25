import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { AuthStatus, CommandError } from "../../shared/types/osu";
import { desktopApi } from "../../shared/lib/tauri";
import { Button, Card } from "../../shared/components/ui";
import { authQueryKey } from "./api";

const OSU_SETTINGS_URL = "https://osu.ppy.sh/home/account/edit";
const securityFeatures: Array<{ label: string; icon: LucideIcon }> = [
  { label: "系统级安全存储", icon: LockKeyhole },
  { label: "只申请 public / identify", icon: ShieldCheck },
  { label: "不上传或共享个人数据", icon: KeyRound },
];

export function AuthSetup({ status }: { status: AuthStatus }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(!status.credentials_configured);
  const [clientId, setClientId] = useState(status.client_id ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    desktopApi.onOAuthResult(async (result) => {
      if (disposed) return;
      setAuthorizing(false);
      if (result.ok) {
        setError(null);
        await queryClient.invalidateQueries({ queryKey: authQueryKey });
      } else {
        setError(result.message);
      }
    }).then((remove) => {
      if (disposed) remove();
      else unlisten = remove;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);

  const copyCallback = async () => {
    await navigator.clipboard.writeText(status.callback_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const saveCredentials = async () => {
    setSaving(true);
    setError(null);
    try {
      await desktopApi.saveOAuthCredentials(clientId, clientSecret);
      setClientSecret("");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: authQueryKey });
    } catch (caught) {
      setError((caught as CommandError).message ?? "无法保存 OAuth 凭据");
    } finally {
      setSaving(false);
    }
  };

  const authorize = async () => {
    setAuthorizing(true);
    setError(null);
    try {
      const pending = await desktopApi.beginOAuthLogin();
      await desktopApi.openExternal(pending.authorization_url);
    } catch (caught) {
      setAuthorizing(false);
      setError((caught as CommandError).message ?? "无法启动授权");
    }
  };

  const cancel = async () => {
    await desktopApi.cancelOAuthLogin();
    setAuthorizing(false);
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-8 py-16">
      <div className="pointer-events-none absolute left-[8%] top-[12%] size-96 rounded-full bg-pink-500/[0.08] blur-[110px]" />
      <div className="pointer-events-none absolute bottom-[8%] right-[8%] size-96 rounded-full bg-cyan-400/[0.07] blur-[120px]" />

      <div className="relative z-10 grid w-full max-w-5xl grid-cols-[.9fr_1.1fr] overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0e1320]/90 shadow-[0_30px_120px_rgba(0,0,0,.48)] backdrop-blur-2xl">
        <section className="relative overflow-hidden border-r border-white/[0.07] p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(255,106,167,.16),transparent_42%)]" />
          <div className="relative">
            <div className="mb-14 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full border-[3px] border-pink-300 text-xs font-black text-pink-100 shadow-[0_0_36px_rgba(255,106,167,.28)]">
                O
              </span>
              <div>
                <p className="text-lg font-semibold text-white">OPP</p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  osu! profile companion
                </p>
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/75">
              私人数据空间
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.045em] text-white">
              让每一段游玩
              <br />
              都有迹可循。
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              OPP 通过官方 osu! API v2 获取你的档案与最佳成绩。密钥和 Token
              只会保存在 Windows 凭据管理器中。
            </p>
            <div className="mt-10 space-y-4">
              {securityFeatures.map(({ label, icon: Icon }) => (
                <div className="flex items-center gap-3 text-sm text-slate-300" key={label}>
                  <span className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-cyan-200">
                    <Icon className="size-4" />
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-300/75">
            {editing ? "初始设置" : "连接账号"}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {editing ? "配置个人 OAuth 应用" : "准备连接 osu!"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {editing
              ? "在 osu! 账号设置中创建 OAuth 应用，并确保回调地址完全一致。"
              : "凭据已安全保存。授权将在系统浏览器中完成。"}
          </p>

          {editing ? (
            <div className="mt-7 space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">回调地址</label>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-cyan-300 transition hover:text-cyan-100"
                    onClick={copyCallback}
                    type="button"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
                <div className="select-all rounded-xl border border-white/[0.08] bg-black/20 px-3.5 py-3 font-mono text-xs text-slate-300">
                  {status.callback_url}
                </div>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-300">Client ID</span>
                <input
                  autoComplete="off"
                  className="opp-input"
                  inputMode="numeric"
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="例如 12345"
                  value={clientId}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-300">
                  Client Secret
                </span>
                <input
                  autoComplete="off"
                  className="opp-input"
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder="只会写入 Windows 凭据管理器"
                  type="password"
                  value={clientSecret}
                />
              </label>
              <div className="flex gap-3 pt-1">
                <Button
                  className="flex-1"
                  onClick={saveCredentials}
                  loading={saving}
                  variant="primary"
                >
                  保存并继续
                  <ArrowRight className="size-4" />
                </Button>
                <Button onClick={() => desktopApi.openExternal(OSU_SETTINGS_URL)}>
                  <ExternalLink className="size-4" />
                  打开 osu! 设置
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-7">
              <Card className="p-5">
                <div className="flex items-center gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-emerald-400/10 text-emerald-200">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">OAuth 凭据已配置</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      Client ID · {status.client_id}
                    </p>
                  </div>
                </div>
              </Card>
              <Button
                className="mt-5 w-full"
                loading={authorizing}
                onClick={authorize}
                variant="primary"
              >
                {authorizing ? "等待浏览器授权" : "使用 osu! 授权"}
                {!authorizing ? <ExternalLink className="size-4" /> : null}
              </Button>
              {authorizing ? (
                <button
                  className="mt-3 w-full py-2 text-xs text-slate-500 hover:text-slate-300"
                  onClick={cancel}
                  type="button"
                >
                  取消授权
                </button>
              ) : (
                <button
                  className="mt-3 w-full py-2 text-xs text-slate-500 hover:text-slate-300"
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  重新配置凭据
                </button>
              )}
            </div>
          )}

          {error ? (
            <div
              className="mt-5 flex items-start gap-3 rounded-xl border border-rose-400/15 bg-rose-400/[0.08] p-3.5 text-sm leading-6 text-rose-200"
              role="alert"
            >
              {authorizing ? (
                <LoaderCircle className="mt-1 size-4 shrink-0 animate-spin" />
              ) : (
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-rose-300" />
              )}
              {error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
