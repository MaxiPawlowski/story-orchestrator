// LoreVarComponent.jsx
import React, { useState, useEffect, useRef } from "react";
import { settings } from "../../../../constants/main";

const LoreVarComponent = ({ loreVar, onChange }) => {
  const [value, setValue] = useState(loreVar.value || "");
  const [height, setHeight] = useState(loreVar.state?.height || "");
  const textareaRef = useRef(null);

  useEffect(() => {
    if (loreVar.type === "ss" && textareaRef.current) {
      if (height) {
        textareaRef.current.style.height = height;
      } else if (
        settings.collapseTextareas &&
        settings.collapsedTextareaHeight
      ) {
        textareaRef.current.style.height = `${settings.collapsedTextareaHeight}px`;
      }
    }
  }, [height, loreVar.type]);

  const handleValueChange = (e) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange({ ...loreVar, value: newValue });
  };

  const autoSize = () => {
    if (textareaRef.current) {
      if (settings.expandedTextareaHeight === -1) {
        textareaRef.current.style.height = "5px";
        textareaRef.current.style.height = `${
          textareaRef.current.scrollHeight + 10
        }px`;
        setHeight(textareaRef.current.style.height);
      } else {
        textareaRef.current.style.height = `${settings.expandedTextareaHeight}px`;
        setHeight(textareaRef.current.style.height);
      }
    }
  };

  const collapse = () => {
    if (settings.collapseTextareas && textareaRef.current) {
      textareaRef.current.style.height = `${settings.collapsedTextareaHeight}px`;
      setHeight(textareaRef.current.style.height);
    }
  };

  let inputElement;
  switch (loreVar.type) {
    case "i":
      inputElement = (
        <input type="number" value={value} onChange={handleValueChange} />
      );
      break;
    case "s":
      inputElement = (
        <input type="text" value={value} onChange={handleValueChange} />
      );
      break;
    case "ss":
      inputElement = (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleValueChange}
          onInput={autoSize}
          onFocus={autoSize}
          onBlur={collapse}
        />
      );
      break;
    default:
      inputElement = null;
  }

  return (
    <label className="lvm--input">
      {loreVar.name}
      {inputElement}
    </label>
  );
};

export default LoreVarComponent;
