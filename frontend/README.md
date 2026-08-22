# Contact AI Hub

A modern, AI-powered contact management and communication platform built with React, TypeScript, and Vite. Contact AI Hub helps you manage your contacts and communicate with them efficiently using AI-powered features.

![Contact AI Hub Screenshot](./public/placeholder.svg)

## ✨ Features

- **Contact Management**: Organize and manage your contacts in a clean, intuitive interface
- **AI-Powered Communication**: Smart suggestions and templates for better communication
- **Template Lab**: Create, manage, and use message templates for common communications
- **Scheduling**: Schedule messages and follow-ups with the built-in scheduler
- **Modern UI**: Built with Radix UI and Shadcn components for a polished look and feel
- **Dark Mode**: Built-in dark mode support for comfortable viewing in any lighting

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ (LTS recommended)
- npm or yarn package manager
- Git (for version control)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/contact-ai-hub.git
   cd contact-ai-hub
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

3. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser to see the application.

## 🛠️ Building for Production

To create a production build:

```bash
npm run build
# or
yarn build
```

To preview the production build:

```bash
npm run preview
# or
yarn preview
```

## 🧰 Technologies Used

- **Frontend Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **UI Components**: Radix UI, Shadcn UI
- **State Management**: React Query
- **Routing**: React Router
- **Icons**: Lucide Icons
- **Styling**: Tailwind CSS
- **Form Handling**: React Hook Form
- **Date Handling**: date-fns

## 📂 Project Structure

```
src/
├── components/               # Reusable UI components
│   ├── ui/                   # Shadcn UI components
│   │   ├── accordion.tsx     # Collapsible content component
│   │   ├── button.tsx        # Button variants and styles
│   │   ├── command.tsx       # Command palette component
│   │   ├── dialog.tsx        # Modal dialogs
│   │   ├── form.tsx          # Form components with validation
│   │   ├── sidebar.tsx       # Navigation sidebar
│   │   └── ...               # Other UI components
│   │
│   ├── ChatInterface.tsx     # Main chat interface component
│   ├── CommandHeader.tsx     # Top navigation/command bar
│   ├── ContactList.tsx       # Contact list sidebar
│   ├── SchedulerView.tsx     # Message scheduling interface
│   ├── TemplateLabModal.tsx  # Template management modal
│   └── NavLink.tsx           # Navigation link component
│
├── hooks/                    # Custom React hooks
│   ├── use-mobile.tsx        # Mobile device detection
│   └── use-toast.ts          # Toast notification hook
│
├── lib/                      # Utility functions and configurations
│   └── utils.ts              # Common utility functions
│
├── pages/                    # Page components
│   ├── Index.tsx             # Main application page
│   └── NotFound.tsx          # 404 page
│
├── App.tsx                   # Root application component
└── main.tsx                  # Application entry point
```

### Key Files and Their Purposes:

- **`src/App.tsx`**: Root component that sets up the application's routing and global providers (React Query, Toast, etc.)
- **`src/main.tsx`**: Entry point that renders the React application
- **`src/pages/`**: Contains all the main page components
  - `Index.tsx`: The main application interface with the three-pane layout
  - `NotFound.tsx`: 404 error page
- **`src/components/`**: Contains all reusable UI components
  - `ChatInterface.tsx`: Handles the main chat/messaging interface
  - `CommandHeader.tsx`: Top navigation bar with search/command palette
  - `ContactList.tsx`: Displays and manages the list of contacts
  - `SchedulerView.tsx`: Interface for scheduling messages
  - `TemplateLabModal.tsx`: Modal for managing message templates
- **`src/components/ui/`**: Shadcn UI components built on top of Radix UI primitives
- **`src/hooks/`**: Custom React hooks for shared logic
- **`src/lib/`**: Utility functions and configurations

### Public Assets

- `public/`: Contains static assets like images, icons, and the favicon
  - `favicon.ico`: Browser tab icon
  - `placeholder.svg`: Default placeholder image
  - `robots.txt`: Search engine instructions

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Vite](https://vitejs.dev/) for the amazing build tool
- [Radix UI](https://www.radix-ui.com/) for accessible UI primitives
- [Shadcn UI](https://ui.shadcn.com/) for beautiful components
- [React Query](https://tanstack.com/query) for server state management

---

Made with ❤️ by [Your Name]
