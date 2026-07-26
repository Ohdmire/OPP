import * as Tooltip from "@radix-ui/react-tooltip";
import { HashRouter } from "react-router-dom";
import { AppConnectionGate } from "./app/AppConnectionGate";
import { TitleBar } from "./shared/components/TitleBar";

export default function App() {
  return (
    <Tooltip.Provider delayDuration={350}>
      <HashRouter>
        <TitleBar />
        <AppConnectionGate />
      </HashRouter>
    </Tooltip.Provider>
  );
}
