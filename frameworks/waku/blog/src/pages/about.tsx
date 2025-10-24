export default async function AboutPage() {
  return (
    <>
      <title>About</title>
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-8">About</h1>

          <div className="space-y-6 text-lg leading-relaxed">
            <p>
              Welcome to ThoughtSpace, a place where I share my journey through
              the ever-evolving landscape of web development and design.
            </p>

            <p>
              I'm a developer passionate about crafting accessible, performant,
              and beautiful digital experiences. With a focus on modern web
              technologies like React, Next.js, and TypeScript, I love exploring
              new patterns and sharing what I learn along the way.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4">
              What I Write About
            </h2>

            <ul className="list-disc list-inside space-y-3 text-muted-foreground">
              <li>Web development best practices and patterns</li>
              <li>Design systems and component architecture</li>
              <li>Performance optimization techniques</li>
              <li>Accessibility and inclusive design</li>
              <li>Modern JavaScript and TypeScript</li>
              <li>React and Next.js deep dives</li>
            </ul>

            <h2 className="text-2xl font-bold mt-12 mb-4">My Approach</h2>

            <p>
              I believe in building with purpose and empathy. Every line of code
              should serve the user, and every design decision should be
              intentional. Through this blog, I aim to share practical insights
              that help others build better products.
            </p>

            <p>
              When I'm not coding or writing, you'll find me exploring new
              technologies, contributing to open source, or enjoying a good cup
              of coffee while reading about the latest developments in web
              standards.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-4">Get in Touch</h2>

            <p className="text-muted-foreground">
              Have questions or want to collaborate? Feel free to reach out
              through social media or drop me an email. I'm always happy to
              connect with fellow developers and designers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: "static",
  } as const;
};
