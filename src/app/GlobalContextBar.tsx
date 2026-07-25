import { ClientSwitch } from "../shared/components/ClientSwitch";
import { ModeSwitch } from "../shared/components/ModeSwitch";
import { useMode } from "./ModeContext";

export function GlobalContextBar() {
  const { client, setClient, ruleset, setRuleset } = useMode();

  return (
    <header className="fixed left-[224px] right-0 top-11 z-30 h-[60px] border-b border-white/[0.06] bg-[#090d17]/92 px-8 backdrop-blur-xl xl:px-10">
      <div className="mx-auto flex h-full max-w-[1480px] items-center gap-3">
        <span className="text-xs font-medium text-slate-500">客户端</span>
        <ClientSwitch onChange={setClient} value={client} />
        <span className="mx-2 h-5 w-px bg-white/[0.07]" />
        <span className="text-xs font-medium text-slate-500">模式</span>
        <ModeSwitch compact onChange={setRuleset} value={ruleset} />
      </div>
    </header>
  );
}
