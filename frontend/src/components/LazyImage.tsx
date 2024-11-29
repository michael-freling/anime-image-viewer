// LazyImage implementation: https://github.com/thebuilder/react-intersection-observer/blob/main/docs/Recipes.md#lazy-image-load
import React, { ImgHTMLAttributes } from "react";
import { useInView } from "react-intersection-observer";

const LazyImage: React.FC<
  {
    src: string;
    width: number;
    height: number;
  } & ImgHTMLAttributes<HTMLImageElement>
> = ({ src, height, width, ...imgProps }) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: "200px 0px",
  });

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        padding: 0,
        margin: 0,
        height: height,
      }}
    >
      {inView ? (
        <img
          {...imgProps}
          src={src}
          width="auto"
          height="100%"
          style={{
            // align an image to a center
            display: "block",
            margin: "0 auto",
          }}
        />
      ) : null}
    </div>
  );
};

export default LazyImage;
