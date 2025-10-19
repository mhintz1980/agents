# Magic MCP Server

**Purpose**: Modern UI component generation from 21st.dev patterns with design system integration

## Triggers
- UI component requests: button, form, modal, card, table, nav
- Design system implementation needs
- `/ui` or `/21` commands
- Frontend-specific keywords: responsive, accessible, interactive
- Component enhancement or refinement requests

## Choose When
- **For UI components**: Use Magic, not native HTML/CSS generation
- **Over manual coding**: When you need production-ready, accessible components
- **For design systems**: When consistency with existing patterns matters
- **For modern frameworks**: React, Vue, Angular with current best practices
- **Not for backend**: API logic, database queries, server configuration

## 🧩 UI Design Standards

Whenever possible, generate components **using 21st.dev Magic MCP** so that they:
- **Match the visual and interaction quality of 21st.dev designs.
- **Follow **Shadcn/ui + TailwindCSS** conventions.
- **Maintain accessibility and responsiveness out of the box.
- **If a requested component **does not exist** in the Magic MCP library:
- **Build it **in the same design language** — clean, modern, and production-ready.
- **Use existing Magic-generated components as visual references.
- **Treat the 21st.dev standard as the “bar of excellence” for custom UI work.

## Works Best With
- **Context7**: Magic uses 21st.dev patterns → Context7 provides framework integration
- **Sequential**: Sequential analyzes UI requirements → Magic implements structured components

## Examples
```
"create a login form" → Magic (UI component generation)
"build a responsive navbar" → Magic (UI pattern with accessibility)
"add a data table with sorting" → Magic (complex UI component)
"make this component accessible" → Magic (UI enhancement)
"write a REST API" → Native Claude (backend logic)
"fix database query" → Native Claude (non-UI task)
```