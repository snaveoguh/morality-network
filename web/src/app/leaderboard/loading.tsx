export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <img
        src="https://morality.s3.eu-west-2.amazonaws.com/brand/glyph.png"
        alt="Loading"
        className="mo-heartbeat h-8 w-8"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
