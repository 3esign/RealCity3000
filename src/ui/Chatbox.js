export class Chatbox {
  constructor(store, aiMayorService) {
    this.store = store;
    this.aiMayorService = aiMayorService;
    
    // UI Elements
    this.panel = document.getElementById('ai-chatbox');
    this.header = this.panel.querySelector('.chatbox-header');
    this.body = document.getElementById('chatbox-body');
    this.input = document.getElementById('chatbox-input');
    this.sendBtn = document.getElementById('chatbox-send-btn');
    this.toggleBtn = document.getElementById('toggle-chatbox-btn');

    this.initEventListeners();
  }

  initEventListeners() {
    this.header.addEventListener('click', () => this.toggleCollapse());
    
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    
    this.input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });

    // Listen for AI responses
    window.addEventListener('ai-mayor-response', (e) => {
      this.appendMessage('AI Mayor', e.detail.message, 'ai-message');
    });
  }

  toggleCollapse() {
    this.panel.classList.toggle('collapsed');
    const icon = this.toggleBtn.querySelector('i');
    if (this.panel.classList.contains('collapsed')) {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    } else {
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    }
  }

  sendMessage() {
    const text = this.input.value.trim();
    if (!text) return;

    // Append user message
    this.appendMessage('You', text, 'user-message');
    this.input.value = '';

    // If AI Mayor is not enabled, warn the user
    const state = this.store.getState();
    if (!state.aiMayorEnabled) {
      setTimeout(() => {
        this.appendMessage('System', 'AI Mayor is currently offline. Please enable AI Mayor Mode to converse.', 'ai-message');
      }, 500);
      return;
    }

    // Pass instruction to AIMayorService
    if (this.aiMayorService) {
      this.aiMayorService.addUserInstruction(text);
      this.appendMessage('AI Mayor', 'I have noted your instruction. I will consider it during my next simulation turn.', 'ai-message');
    }
  }

  appendMessage(sender, text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${className}`;
    
    const senderSpan = document.createElement('span');
    senderSpan.className = 'message-sender';
    senderSpan.textContent = sender;
    
    const textP = document.createElement('p');
    textP.textContent = text;
    
    msgDiv.appendChild(senderSpan);
    msgDiv.appendChild(textP);
    
    this.body.appendChild(msgDiv);
    
    // Scroll to bottom
    this.body.scrollTop = this.body.scrollHeight;
  }
}

export default Chatbox;
