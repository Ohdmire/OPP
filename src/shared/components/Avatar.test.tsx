import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

const profile = {
  id: 7,
  username: "Shimi",
  avatar_url: "https://a.ppy.sh/7",
  avatar_data_url: "data:image/png;base64,Y2FjaGVk",
};

describe("Avatar", () => {
  it("falls back from local cache to remote and then to an initial", () => {
    render(<Avatar profile={profile} />);

    const cached = screen.getByRole("img", { name: "Shimi 的头像" });
    expect(cached).toHaveAttribute("src", profile.avatar_data_url);

    fireEvent.error(cached);
    const remote = screen.getByRole("img", { name: "Shimi 的头像" });
    expect(remote).toHaveAttribute("src", profile.avatar_url);

    fireEvent.error(remote);
    expect(
      screen.getByRole("img", { name: "Shimi 的头像占位" }),
    ).toHaveTextContent("S");
  });
});
