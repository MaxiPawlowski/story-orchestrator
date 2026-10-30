import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { Section } from "@components/ui/Section";
import { CheckRow } from "./Field";
import { InlineControls } from "./InlineControls";
import { PresenceControls } from "./PresenceControls";
import { DeviceChip, useDeviceSetting, type DeviceStore } from "./DeviceSetting";

export interface DisplayPageProps {
  snapshot: RuntimeSnapshot;
  manager: RuntimeManager;
  deviceStore?: DeviceStore;
}

export const DisplayPage = ({ snapshot, manager, deviceStore }: DisplayPageProps) => {
  const notify = () => manager.notify();
  const hud = useDeviceSetting<boolean>("display.hudEnabled", snapshot.ui.hudEnabled, (on) => manager.setUiSettings({ hudEnabled: on }), notify, deviceStore);
  const yourMove = useDeviceSetting<boolean>("display.yourMove", snapshot.ui.yourMove !== false, (on) => manager.setUiSettings({ yourMove: on }), notify, deviceStore);
  const error = hud.error ?? yourMove.error;
  return <div className="so-settings-page" id="so-display-header">
    <header className="so-page-head"><h2>Display</h2>
      <p className="so-section-desc">What shows in the chat. Affects every chat; a row marked This device uses its own value in this browser only.</p></header>
    <Section title="Under the replies" level={3}>
      <InlineControls snapshot={snapshot} manager={manager} deviceStore={deviceStore} />
      <CheckRow id="so-announce-transitions" setting="display.announceTransitions" checked={snapshot.ui.announceTransitions}
        onChange={(on) => manager.setUiSettings({ announceTransitions: on })} />
    </Section>
    <Section title="Above the chat input" level={3}>
      <CheckRow id="so-hud-enabled" setting="display.hudEnabled" checked={snapshot.ui.hudEnabled} scope={hud.overridden ? "device" : undefined}
        extra={<DeviceChip setting={hud} label="Story status" />} onChange={hud.write} />
      <CheckRow id="so-your-move-enabled" setting="display.yourMove" checked={snapshot.ui.yourMove !== false} scope={yourMove.overridden ? "device" : undefined}
        extra={<DeviceChip setting={yourMove} label="Your move" />} onChange={yourMove.write} />
    </Section>
    <Section title="When a story starts" level={3}>
      <CheckRow id="so-briefing-enabled" setting="display.briefing" checked={snapshot.ui.briefing !== false} onChange={(on) => manager.setUiSettings({ briefing: on })} />
      <CheckRow id="so-briefing-draft" setting="display.briefingDraft" checked={snapshot.ui.briefingDraft !== false} onChange={(on) => manager.setUiSettings({ briefingDraft: on })} />
      <CheckRow id="so-player-setup-enabled" setting="display.playerSetup" checked={snapshot.ui.playerSetup !== false} onChange={(on) => manager.setUiSettings({ playerSetup: on })} />
    </Section>
    <Section title="Panels and badges" level={3}>
      <PresenceControls snapshot={snapshot} onChange={(presence) => manager.setUiSettings({ presence })} />
    </Section>
    {error && <p role="alert" className="so-warning-text">{error}</p>}
  </div>;
};

export default DisplayPage;
