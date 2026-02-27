Please **land the plane**:

1. If the project uses `beads` (you can check by checking for the existence of the `.beads` folder):
    - Run `bd sync` to ensure all tasks have been properly synchronized.
    - When commiting, also commit changes on the `.beads` directory.

1. Run the **quality gates** for this application:
    - For JavaScript/Typescript projects, it is `oxfmt` and the actual build systems.
    - For Python projects, it is `ty` and `ruff`.
    - If inside a project with Nix, run it using `nix develop`.

3. Create a `jujutsu` commit with `jj commit <changed paths> -m <message>`.
    - Use the `Conventional Commits` format for your commits.
    - Beyond a proper commit title, add a detailed description, explaining what
      changed, why and what is the main goal being pursued.
