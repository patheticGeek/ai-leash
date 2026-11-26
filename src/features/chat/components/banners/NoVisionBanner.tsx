import { Banner } from "@astryxdesign/core/Banner";

// Images are attached but the picked model can't see them (#74): they're
// still sent, each as a line naming its path, so the agent knows they're
// there — the user should know it won't actually look at them.
export default function NoVisionBanner({ model }: { model: string }) {
  return (
    <Banner
      status="warning"
      elevation="low"
      collapsible={false}
      title="This model can't see images"
      description={`${model} doesn't accept images, so attached images go to it as file paths only. Pick a vision model to have it look at them.`}
    />
  );
}
