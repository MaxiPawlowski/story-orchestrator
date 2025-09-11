import React, { useEffect, useState } from 'react';
import ObjectiveManager, {} from '../../../services/ObjetiveManager';

const Objetives = ({ initialObjective }) => {
  const [objectiveManager] = useState(new ObjectiveManager(defaultPrompts));
  const [tasks, setTasks] = useState([]);
  const [currentTask, setCurrentTask] = useState(null);

  useEffect(() => {
    loadObjective(initialObjective);
  }, [initialObjective]);

  const loadObjective = async (objectiveDescription) => {
    objectiveManager.currentObjective = { description: objectiveDescription, children: [] };
    const generatedTasks = await objectiveManager.generateTasks(objectiveManager.currentObjective);
    setTasks(generatedTasks);
    setCurrentTask(objectiveManager.currentTask);
  };

  const handleCompleteTask = async (taskId) => {
    const task = objectiveManager.getTaskById(taskId);
    if (task) {
      objectiveManager.completeTask(task);
      setTasks([...objectiveManager.currentObjective.children]);
      setCurrentTask(objectiveManager.currentTask);
    }
  };

  const handleCheckTaskCompletion = async () => {
    const isCompleted = await objectiveManager.checkTaskCompleted(currentTask);
    if (isCompleted) handleCompleteTask(currentTask.id);
  };

  const handleAddTask = (description) => {
    objectiveManager.addTask(description);
    setTasks([...objectiveManager.currentObjective.children]);
  };

  return (
    <div className="task-manager">
      <h2>Objective: {objectiveManager.currentObjective?.description}</h2>

      <div className="task-list">
        {tasks.map((task) => (
          <div key={task.id} className={`task ${task.completed ? 'completed' : ''}`}>
            <span>{task.description}</span>
            {!task.completed && (
              <button onClick={() => handleCompleteTask(task.id)}>Complete</button>
            )}
          </div>
        ))}
      </div>

      <div className="task-controls">
        <button onClick={handleCheckTaskCompletion}>Check Task Completion</button>
        <button onClick={() => handleAddTask('New Custom Task')}>Add New Task</button>
      </div>

      {currentTask && (
        <div className="current-task">
          <h3>Current Task</h3>
          <p>{currentTask.description}</p>
        </div>
      )}
    </div>
  );
};

export default Objetives;
