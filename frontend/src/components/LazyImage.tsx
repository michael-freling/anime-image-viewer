// LazyImage implementation: https://github.com/thebuilder/react-intersection-observer/blob/main/docs/Recipes.md#lazy-image-load
import { AspectRatio } from "@mui/joy";
import React, { ImgHTMLAttributes } from "react";
import { useInView } from "react-intersection-observer";

const LazyImage: React.FC<
  {
    src: string;
    width: number;
  } & ImgHTMLAttributes<HTMLImageElement>
> = ({ src, width, ...imgProps }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: "200px 0px",
  });
  var query = new URLSearchParams();
  query.append("width", width.toFixed(0));

  return (
    <AspectRatio ref={ref} ratio="16/9" objectFit="contain">
      {inView ? (
        <img {...imgProps} src={src + "?" + query.toString()} loading="lazy" />
      ) : null}
    </AspectRatio>
  );
};

export default LazyImage;
