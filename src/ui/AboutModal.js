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
        <em>Academic Citation: Clarke, K. C., Hoppen, S., & Gaydos, L. (1997). "A self-modifying cellular automaton model of historical land use change..."</em>
      </p>
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
        <em>Academic Citation: Alonso, W. (1964). "Location and Land Use: Toward a General Theory of Land Rent."</em>
      </p>
      <p>
        The land value of each cell represents its location desirability. We model this following <strong>Alonso's Bid-Rent theory</strong>, 
        stipulating that land rent values decay exponentially with distance from commercial hubs:
      </p>
      <div class="math-eq">
        \\[ V(x,y) = V_{\\text{base}} \\times \\text{Accessibility}^{0.6} \\times \\text{GreenAccess}^{0.3} \\times (1 - \\text{Pollution}^{0.6}) \\times e^{-\\lambda D_{com}} \\]
      </div>
      <p>
        Where:
        <ul>
          <li>\\( D_{com} \\) is the Euclidean distance from the cell to the <strong>nearest commercial center cell</strong>, creating realistic polycentric urban peaks.</li>
          <li>\\( \\lambda = 0.015 \\) is the gentled rent decay constant (providing realistic propagation across grids).</li>
          <li>\\( \\text{Pollution} \\) scales as inverse-square falloff from industrial centers.</li>
        </ul>
      </p>

      <h3>3. Agent-Based Utility Functions (ABM Layer)</h3>
      <p>
        <em>Academic Citation: Ligmann-Zielinska, A., & Jankowski, P. (2007). "Agent-based modelling of spatial decision-making..."</em>
      </p>
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
        <em>Academic Citation: Forrester, J. W. (1969). "Urban Dynamics."</em>
      </p>
      <p>
        RCI (Residential, Commercial, Industrial) demand balances dynamically following stocks and flows, 
        modulated by congestion penalties, tax rate thresholds, and environmental regulation caps:
      </p>
      <div class="math-eq">
        \\[ \\text{Jobs} = (5 \\times C) + (8 \\times I) + (4 \\times \\text{Inst}) \\]
        \\[ \\Delta_R = (\\text{Jobs} - \\text{Population}) \\cdot 0.015 - (\\text{TaxRate} - 15) \\cdot 0.4 + (\\text{PopGrowth} \\cdot 1.2) + (\\text{EconGrowth} \\cdot 0.6) \\]
        \\[ \\text{Demand}_R = \\text{clamp}(\\text{Demand}_R + \\Delta_R - P_{congestion} - P_{tax}, 0, 100) \\]
      </div>
      <p>
        Where global congestion penalty \\( P_{congestion} = 6.0 \\times D_{urban} \\), and high tax penalties (>20%) act as direct downward pressure.
      </p>

      <h3>5. Dual-Source Spatial Visual Processing</h3>
      <p>
        RealCity3000 implements a <strong>Dual-Source Spatial Visual Processing</strong> relation, resolving urban boundaries through two cross-validating sources:
      </p>
      <ul>
        <li><strong>Cadastral Vector Stream (OSM Outlines)</strong>: Extracts explicit architectural vector footprints (polygons and polylines) for buildings, highways, and water bodies.
          <br><em>Confidence: 100% (Direct cadastral geometry import)</em>
        </li>
        <li><strong>Spectral Optical Stream (Vision AI Satellite Parse)</strong>: Inspects satellite maps to discover environmental land-use anomalies, such as industrial brownfields, vacant construction lots, or dense tree clusters.
          <br><em>Confidence: 82% (Internal model classification metric, not externally validated)</em>
        </li>
      </ul>

      <h3>6. Visual Layer Force Fields: Spatial Parameter Mapping</h3>
      <p>
        These overlay layers represent the core spatial variables driving agent choices and cellular automata growth rules:
      </p>
      <ul>
        <li><strong>Accessibility Field (Cyan)</strong>: Visualizes proximity to highway infrastructure. High accessibility directly raises the residential, commercial, and industrial developer utility calculations.</li>
        <li><strong>Land Value Field (Gold)</strong>: Visualizes the bid-rent rent-gradient decay from business centers. High land values attract high-density residential developments but penalize heavy industry.</li>
        <li><strong>Pollution Field (Purple)</strong>: Visualizes industrial smoke accumulation. High pollution triggers local residential decay/abandonment.</li>
        <li><strong>Growth Pressure Field (Red)</strong>: Visualizes the combined developer attraction index before CA stochastic sweeps are run.</li>
      </ul>

      <h3>7. Resolution, Validation & Optimization Metrics</h3>
      <ul>
        <li><strong>Spatial Resolution</strong>: Each cell represents a <strong>10m &times; 10m</strong> area. A default 150 &times; 150 grid models exactly <strong>2.25 km²</strong>.</li>
        <li><strong>Historical Validation Mode</strong>: Clones the initial grid, clears building footprints, simulates 2017 &rarr; 2026, and matches against OSM to output Precision, Recall, F1-Score, and Mean Spatial Error (meters).</li>
        <li><strong>Simulated Annealing Optimizer</strong>: Automatically adjusts Diffusion, Spread, and Road Gravity sliders using a Boltzmann cooling loop to maximize validation F1-scores.</li>
      </ul>

      <hr style="border: 0; border-top: 1px solid var(--border-solid); margin: 16px 0;" />
      <p style="text-align: center; font-size: 10px; font-family: var(--font-mono); color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">
        RealCity3000 &copy; Developed by PhD Poturak Semir & Union Nikola Tesla University Academic Staff Team
      </p>
    </div>
  `;
}
