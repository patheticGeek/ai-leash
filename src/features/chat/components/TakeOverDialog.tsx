import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, Layout, LayoutFooter } from "@astryxdesign/core/Layout";

// What the user was doing in a followed task's chat when we asked.
export type TakeOverAsk = "send" | "stop";

// Asks before the user's send or Stop in a task chat the project chat is
// following takes it over (`take_over` on `send_prompt`/`cancel_prompt`,
// see `board::messaging::on_user_message`). `onChoose(true)` takes it
// over, `onChoose(false)` sends without (send only), `onCancel` does
// neither.
export default function TakeOverDialog({
  ask,
  taskNumber,
  onChoose,
  onCancel,
}: {
  ask: TakeOverAsk | null;
  taskNumber: number;
  onChoose: (takeOver: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      isOpen={ask !== null}
      role="alertdialog"
      width={440}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Layout
        header={
          <DialogHeader
            title={`Take over #${taskNumber} from the project chat?`}
            subtitle={
              ask === "stop"
                ? "Stopping takes this task over from the project chat."
                : "The project chat is following this task. If you take over, its replies stop going to the project chat until you hand it back. You can still message each other."
            }
            hasDivider={false}
          />
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button variant="ghost" label="Cancel" onClick={onCancel} />
              {ask === "send" && (
                <Button
                  variant="secondary"
                  label="Keep project chat following"
                  onClick={() => onChoose(false)}
                />
              )}
              <Button
                variant="primary"
                label={ask === "stop" ? "Stop and take over" : "Take over"}
                onClick={() => onChoose(true)}
                data-autofocus
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
