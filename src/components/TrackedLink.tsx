"use client";

interface Props {
  linkId: string;
  href: string;
  buttonColor: string;
  icon?: string;
  title: string;
  description?: string;
}

export default function TrackedLink({ linkId, href, buttonColor, icon, title, description }: Props) {
  function handleClick() {
    // Fire-and-forget click log
    fetch("/api/links/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    }).catch(() => {});
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      style={{
        display: "block",
        width: "100%",
        padding: "14px 20px",
        borderRadius: 10,
        textAlign: "center",
        fontWeight: 600,
        transition: "transform 0.15s, box-shadow 0.15s",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        backgroundColor: buttonColor,
        color: "#ffffff",
        textDecoration: "none",
        fontFamily: "'Inter', sans-serif",
        fontSize: 15,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        {icon && <span style={{ marginRight: 8 }}>{icon}</span>}
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 3 }}>{description}</div>
      )}
    </a>
  );
}
