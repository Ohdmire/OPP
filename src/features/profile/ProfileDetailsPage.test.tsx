import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OwnProfile } from "../../shared/types/osu";
import { AboutProfile } from "./ProfileDetailsPage";

const profile = {
  id: 1,
  username: "player",
  avatar_url: "https://example.test/avatar.png",
  country_code: "CN",
  is_active: true,
  is_online: false,
  is_supporter: false,
  page: {
    html: '<p onclick="steal()">安全文本</p><script>steal()</script><a href="javascript:steal()">危险链接</a>',
  },
} satisfies OwnProfile;

describe("AboutProfile", () => {
  it("removes scripts, event handlers and unsafe protocols", () => {
    const { container } = render(<AboutProfile profile={profile} />);
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("[onclick]")).not.toBeInTheDocument();
    expect(container.querySelector("a")).not.toHaveAttribute("href");
    expect(container).toHaveTextContent("安全文本");
  });
});
