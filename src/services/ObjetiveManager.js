class ObjectiveManager {
  constructor(defaultPrompts) {
    this.taskTree = null;
    this.currentObjective = null;
    this.currentTask = null;
    this.defaultPrompts = defaultPrompts;
    this.prompts = { ...defaultPrompts };
  }

  async generateTasks(objective) {
    const prompt = this.substituteParamsPrompts(this.prompts.createTask, objective, null, false);
    const taskResponse = await this.generateQuietPrompt(prompt);

    this.clearTasks();
    const numberedListPattern = /^\d+\./;
    taskResponse.split('\n').forEach((task, index) => {
      if (numberedListPattern.test(task.trim())) {
        this.addTask(task.replace(numberedListPattern, '').trim());
      }
    });

    return this.taskTree.children;
  }

  async checkTaskCompleted(task) {
    const prompt = this.substituteParamsPrompts(this.prompts.checkTaskCompleted, null, task, false);
    const taskResponse = (await this.generateQuietPrompt(prompt)).toLowerCase();
    return taskResponse.includes('true');
  }

  getTaskById(taskId) {
    if (!taskId) throw 'Task ID cannot be null';
    return this.findTaskRecursively(taskId, this.taskTree);
  }

  findTaskRecursively(taskId, task) {
    if (task.id === taskId) return task;
    for (const child of task.children) {
      const result = this.findTaskRecursively(taskId, child);
      if (result) return result;
    }
    return null;
  }

  getNextIncompleteTask(task) {
    if (!task.completed && task.children.length === 0) return task;
    for (const child of task.children) {
      if (!child.completed) return this.getNextIncompleteTask(child);
    }
    return null;
  }

  addTask(description) {
    const newTask = new Task({ description, parentId: this.currentObjective?.id ?? '' });
    this.currentObjective.children.push(newTask);
  }

  completeTask(task) {
    task.completed = true;
    this.checkParentComplete(task.parentId);
    this.setNextTask();
  }

  checkParentComplete(parentId) {
    const parent = this.getTaskById(parentId);
    if (parent && parent.children.every(child => child.completed)) {
      parent.completed = true;
    }
  }

  setNextTask() {
    this.currentTask = this.getNextIncompleteTask(this.taskTree) || null;
  }

  substituteParamsPrompts(content, objective = '', task = '', substituteGlobal = false) {
    content = content.replace(/{{objective}}/g, objective?.description ?? '');
    content = content.replace(/{{task}}/g, task?.description ?? '');
    if (substituteGlobal) content = this.substituteGlobalParams(content);
    return content;
  }

  clearTasks() {
    if (this.taskTree) {
      this.taskTree.children = [];
    }
  }

  async generateQuietPrompt(prompt) {
    // Placeholder: Implement actual logic to send the prompt to the model and return the response
  }

  substituteGlobalParams(content) {
    // Placeholder: Implement global parameter substitution logic here
  }
}

class Task {
  constructor({ id = null, description, completed = false, parentId = '' }) {
    this.id = id ?? this.generateId();
    this.description = description;
    this.completed = completed;
    this.parentId = parentId;
    this.children = [];
  }

  generateId() {
    return Math.floor(Math.random() * 100000);  // Replace with a more sophisticated ID generator if needed
  }
}

const defaultPrompts = {
  createTask: 'Generate tasks for objective: "{{objective}}"',
  checkTaskCompleted: 'Check if task "{{task}}" is completed.',
  currentTask: 'Your current task is "{{task}}".'
};

const objectiveManager = new ObjectiveManager(defaultPrompts);
