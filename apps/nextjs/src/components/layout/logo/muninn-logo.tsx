import type { LogoWithTitleProps } from "./logo";
import { Logo, LogoWithTitle } from "./logo";

interface LogoProps {
  size: number;
}

export const muninnLogoPath = "/logo/logo.png";
export const muninnPageTitle = "Muninn";

const imageOptions = {
  src: muninnLogoPath,
  alt: "Muninn logo",
  shouldUseNextImage: true,
};

export const MuninnLogo = ({ size }: LogoProps) => <Logo size={size} {...imageOptions} />;

interface CommonLogoWithTitleProps {
  size: LogoWithTitleProps["size"];
}

export const MuninnLogoWithTitle = ({ size }: CommonLogoWithTitleProps) => {
  return <LogoWithTitle size={size} title={muninnPageTitle} image={imageOptions} />;
};
