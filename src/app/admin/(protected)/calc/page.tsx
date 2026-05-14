export const metadata = { title: "Home Purchase Calculator | Admin" };

export default function CalcPage() {
  return (
    <div style={{ margin: "-24px" }}>
      <iframe
        src="/calc-tool.html"
        style={{ width: "100%", height: "calc(100vh - 64px)", border: "none", display: "block" }}
        title="Home Purchase Calculator"
      />
    </div>
  );
}
