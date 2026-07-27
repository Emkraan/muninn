"use client";

import { useRequiredBoard } from "@homarr/boards/context";

import { muninnLogoPath, muninnPageTitle } from "./muninn-logo";
import type { LogoWithTitleProps } from "./logo";
import { Logo, LogoWithTitle } from "./logo";

interface LogoProps {
  size: number;
}

const useImageOptions = () => {
  const board = useRequiredBoard();
  return {
    src: board.logoImageUrl ?? muninnLogoPath,
    alt: "Board logo",
    shouldUseNextImage: false,
  };
};

export const BoardLogo = ({ size }: LogoProps) => {
  const imageOptions = useImageOptions();
  return <Logo size={size} {...imageOptions} />;
};

interface CommonLogoWithTitleProps {
  size: LogoWithTitleProps["size"];
  hideTitleOnMobile?: boolean;
}

export const BoardLogoWithTitle = ({ size, hideTitleOnMobile }: CommonLogoWithTitleProps) => {
  const board = useRequiredBoard();
  const imageOptions = useImageOptions();
  return (
    <LogoWithTitle
      size={size}
      hideTitleOnMobile={hideTitleOnMobile}
      title={board.pageTitle ?? muninnPageTitle}
      image={imageOptions}
    />
  );
};
