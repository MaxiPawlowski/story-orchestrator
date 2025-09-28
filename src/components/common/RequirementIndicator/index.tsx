const RequirementIndicator = ({
  text,
  color,
  onReload,
  detail,
}: {
  text: string,
  color: string,
  onReload?: () => void,
  detail?: string | null,
}) => {
  return (
    <div className=" flex flex-col gap-1">
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
      {detail ? <div className="text-xs opacity-80 ml-6">{detail}</div> : null}
    </div>
  );
};

export default RequirementIndicator;
