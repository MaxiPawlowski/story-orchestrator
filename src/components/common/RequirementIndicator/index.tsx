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
    <div className=" flex items-center gap-2">
      <div className={`status-indicator ${color}`}></div>
      <div className="">{text}</div>
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
