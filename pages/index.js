export default function Home() {
  if (typeof window !== "undefined") {
    window.location.replace("/game.html");
  }
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
      <p>
        Redirecting to the game… if nothing happens, <a href="/game.html">click here</a>.
      </p>
    </div>
  );
}
