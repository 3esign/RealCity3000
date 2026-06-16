// AboutModal: Content generator for the scientific methodology and mathematical models

export function getMethodologyHTML() {
  return `
    <div class="methodology-container">
      <p class="summary-text">
        <strong>RealCity3000</strong> is an advanced, multi-paradigm urban simulation platform combining <strong>Cellular Automata (CA)</strong>, 
        <strong>Agent-Based Modeling (ABM)</strong>, and <strong>System Dynamics</strong> to simulate the emergent spatial patterns of real-world urban regions.
      </p>

      <hr style="border: 0; border-top: 1px solid var(--border-solid); margin: 16px 0;" />

      <h3>1. Cellular Automata & Urban Sprawl (SLEUTH-inspired)</h3>
      <p>
        Growth is modeled through four sequential Monte Carlo growth rules executing every simulated year. 
        To achieve realistic dynamics, all rules are regulated by the global <strong>Carrying Capacity</strong> 
        \\( (1 - D_{urban}) \\) and the macro <strong>RCI Demand Factor</strong> \\( F_{demand} \\):
      </p>
      <ul>
        <li><strong>Spontaneous Growth</strong>: Models random urbanization of vacant land. Probability:
          <div class="math-eq">\\( P_{spontaneous} = \\frac{\\text{Diffusion}}{2500} \\times \\left( 1 - \\frac{\\text{Slope}}{10} \\right) \\times (1 - D_{urban}) \\times F_{demand} \\)</div>
        </li>
        <li><strong>New Spreading Center</strong>: Spontaneous pixels can spawn new spreading nuclei. Probability:
          <div class="math-eq">\\( P_{breed} = \\frac{\\text{Breed}}{150} \\times (1 - D_{urban}) \\times F_{demand} \\)</div>
        </li>
        <li><strong>Edge (Organic) Growth</strong>: Urbanization expanding outward from existing edges. Probability:
          <div class="math-eq">\\( P_{edge} = \\frac{\\text{Spread}}{200} \\times \\text{Count of Urban Neighbors} \\times (1 - D_{urban}) \\times F_{demand} \\)</div>
        </li>
        <li><strong>Road-Influenced Growth</strong>: Development attracted to highway infrastructures. Probability:
          <div class="math-eq">\\( P_{road} = \\frac{\\text{RoadGravity}}{200} \\times e^{-\\text{DistanceToRoad} / 10} \\times (1 - D_{urban}) \\times F_{demand} \\)</div>
        </li>
      </ul>

      <h3>2. Bid-Rent Desirability Fields (Alonso Theory)</h3>
      <p>
        The land value of each cell represents its location desirability. We model this following <strong>Alonso's Bid-Rent theory</strong>, 
        stipulating that land rent values decay exponentially with distance from commercial hubs (city centers):
      </p>
      <div class="math-eq">
        \\[ V(x,y) = V_{\\text{base}} \\times \\text{Accessibility}^{0.6} \\times \\text{GreenAccess}^{0.3} \\times (1 - \\text{Pollution}^{0.6}) \\times e^{-\\lambda d} \\]
      </div>
      <p>
        Where:
        <ul>
          <li>\\( d \\) is the distance from the commercial center centroid.</li>
          <li>\\( \\lambda = 0.04 \\) is the rent decay constant.</li>
          <li>\\( \\text{Pollution} \\) scales as inverse-square falloff from industrial centers.</li>
        </ul>
      </p>

      <h3>3. Agent-Based Utility Functions (ABM Layer)</h3>
      <p>
        In addition to CA cellular changes, autonomous developers seek local optimization based on utility functions:
      </p>
      <table class="table-cad">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Zoning Target</th>
            <th>Utility Maximization Curve</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Residential</strong></td>
            <td>Residential (Low/High)</td>
            <td>\\( U_R = 0.4 \\cdot \\text{Access} + 0.3 \\cdot \\text{Green} - 0.2 \\cdot \\text{Pollution} - 0.1 \\cdot V_{\\text{land}} \\)</td>
          </tr>
          <tr>
            <td><strong>Commercial</strong></td>
            <td>Commercial</td>
            <td>\\( U_C = 0.4 \\cdot \\text{LocalPop} + 0.4 \\cdot \\text{Access} + 0.2 \\cdot V_{\\text{land}} \\)</td>
          </tr>
          <tr>
            <td><strong>Industrial</strong></td>
            <td>Industrial</td>
            <td>\\( U_I = 0.5 \\cdot (1 - V_{\\text{land}}) + 0.4 \\cdot \\text{Access} - 0.3 \\cdot \\text{LocalPop} \\)</td>
          </tr>
        </tbody>
      </table>

      <h3>4. Macro Feedback Loops (Systems Dynamics)</h3>
      <p>
        RCI (Residential, Commercial, Industrial) demand balances dynamically following stocks and flows, 
        modulated by congestion penalties, tax rate thresholds, and environmental regulation caps:
      </p>
      <div class="math-eq">
        \\[ \\text{Jobs} = (5 \\times C) + (8 \\times I) + (4 \\times \\text{Inst}) \\]
        \\[ \\Delta_R = (\\text{Jobs} - \\text{Population}) \\cdot 0.05 - (\\text{TaxRate} - 15) \\cdot 0.8 - P_{congestion} - P_{tax} \\]
        \\[ \\text{Demand}_R = \\text{clamp}(\\text{Demand}_R + \\Delta_R, 0, 100) \\]
      </div>
      <p>
        Where global congestion penalty \\( P_{congestion} = 6.0 \\times D_{urban} \\), and high tax penalties (>20%) act as direct downward pressure.
      </p>

      <h3>5. Dual-Source Spatial Visual Processing</h3>
      <p>
        RealCity3000 implements a <strong>Dual-Source Spatial Visual Processing</strong> relation, resolving urban boundaries through two cross-validating sources:
      </p>
      <ul>
        <li><strong>Cadastral Vector Stream (OSM Outlines)</strong>: Extracts explicit architectural vector footprints (polygons and polylines) for buildings, highways, and water bodies, establishing ground-truth CAD geometric boundaries.</li>
        <li><strong>Spectral Optical Stream (Vision AI Satellite Parse)</strong>: Inspects static satellite maps to discover environmental land-use anomalies, such as industrial brownfields, vacant construction lots, or dense tree clusters that lack formal cadastral vector tagging.</li>
      </ul>
      <p>
        <strong>Positional Relations:</strong> The vector data acts as a geometric structural mask. The visual optical parser operates within the unmapped structural voids (vacant spaces), injecting semantic classifications (e.g., converting a vacant CAD sector adjacent to highways into a brownfield zone with depressed land rent, or designating an unmapped canopy zone as protected forestry).
      </p>
      <h3>6. High-Performance CAD Visualization & Parametric Facades</h3>
      <p>
        The 3D WebGL engine in RealCity3000 connects parameter values directly to visual attributes and uses custom geometries:
      </p>
      <ul>
        <li><strong>GPU Instanced Mesh Architecture</strong>: To maintain 60fps performance over large grids, we utilize static <code>THREE.InstancedMesh</code> buffers. Vacant or demolished cells scale their size down to <code>0.0001</code> and reside underground, reducing draw calls to exactly 2.</li>
        <li><strong>Parametric Facade Face Subdivision</strong>: Instead of solid boxes, buildings are generated using a custom parametric geometry. We subdivide base box buffers and calculate coordinates to prune specific triangles representing window panes. This dynamically builds structured columns and floor slabs.</li>
        <li><strong>Live Parameter Manifestation</strong>: Visual parameters respond directly to UI sliders in real-time:
          <ul>
            <li><em>Environmental Regulations</em>: Dynamically drives fog color and thickness, morphing from clean blue sky (high regulations) to dense, dirty brownish smog (low regulations).</li>
            <li><em>Tax Rate</em>: Direct controller of skyscraper emissive lights (low tax rates drive bright, optimistic cyan window glow; high tax rates dim the windows to a dark, vacant blue).</li>
            <li><em>Green Protection</em>: Directly scales the height and green color saturation of procedural tree meshes.</li>
            <li><em>Density Cap</em>: Determines the maximum heights and face subdivisions of residential/commercial buildings.</li>
          </ul>
        </li>
      </ul>

      <hr style="border: 0; border-top: 1px solid var(--border-solid); margin: 16px 0;" />
      <p style="text-align: center; font-size: 10px; font-family: var(--font-mono); color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">
        RealCity3000 &copy; Developed by Union Nikola Tesla University Academic Staff Team
      </p>
    </div>
  `;
}
