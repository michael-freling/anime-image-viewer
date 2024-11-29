// LazyImage implementation: https://github.com/thebuilder/react-intersection-observer/blob/main/docs/Recipes.md#lazy-image-load
import { AspectRatio } from "@mui/joy";
import React, { ImgHTMLAttributes } from "react";
import { useInView } from "react-intersection-observer";

const LazyImage: React.FC<
  {
    src: string;
  } & ImgHTMLAttributes<HTMLImageElement>
> = ({ src, ...imgProps }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: "200px 0px",
  });

  return (
    <AspectRatio ref={ref} ratio="16/9" objectFit="contain">
      {inView ? <img {...imgProps} src={src} loading="lazy" /> : null}
    </AspectRatio>
  );
};

export default LazyImage;
