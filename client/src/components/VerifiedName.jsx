function VerifiedName({ name, isVerified, className = '' }) {
  const classes = ['verified-name', className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      <span>{name}</span>
      {isVerified ? (
        <span className="verified-badge" aria-label="Email verified" title="Email verified">
          ✓
        </span>
      ) : null}
    </span>
  );
}

export default VerifiedName;
