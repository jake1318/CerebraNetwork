// src/components/ProtocolBadge.tsx
// Last Updated: 2025-05-18 19:40:37 UTC by jake1318

import React from "react";
import "./protocolBadges.scss";

interface ProtocolBadgeProps {
  protocol: string;
  isVault?: boolean;
  onClick?: () => void;
  className?: string;
}

const ProtocolBadge: React.FC<ProtocolBadgeProps> = ({
  protocol,
  isVault = false,
  onClick,
  className = "",
}) => {
  // Normalize protocol name to match our CSS classes
  const normalizedProtocol = protocol?.toLowerCase() || "unknown";

  // Combine classes for the badge
  const badgeClasses = [
    "protocol-badge",
    normalizedProtocol,
    isVault ? "vault" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={badgeClasses}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      {isVault ? `${protocol} Vault` : protocol}
    </span>
  );
};

export default ProtocolBadge;
