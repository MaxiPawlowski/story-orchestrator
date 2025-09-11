const RequirementIndicator = ({
  text,
  color,
  onReload,
}: {
  text: string,
  color: string,
  onReload?: () => void,
}) => {
  return (
    <div className="online_status">
      <div className={`status-indicator ${color}`}></div>
      <div className="online_status_text">{text}</div>
      {onReload && (
        <i
          onClick={onReload}
          className="requirements-reload fa-lg fa-solid fa-repeat"
        ></i>
      )}
    </div>
  );
};

export default RequirementIndicator;
