export const publications = Object.freeze([
  {
    id: 'pub1',
    title: 'Computational Estimation of Microsecond to Second Atomistic Folding Times',
    description:
      'A research paper on developing computational methods for simulating and analyzing protein-ligand binding, which has implications for drug discovery.'
  },
  {
    id: 'pub2',
    title: 'Middle-way flexible docking',
    description:
      'A publication focused on using a combined resolution approach with Monte Carlo simulations to predict the poses of molecules binding to estrogen receptors, a key step in computational drug design.'
  },
  {
    id: 'pub3',
    title: 'Role of length-dependent stability of collagen-like peptides',
    description:
      'An early career research paper using molecular dynamics to investigate the stability of collagen-like peptides based on their length, highlighting foundational work in molecular simulation.'
  },
  {
    id: 'pub4',
    title: 'Exploring the changes in the structure of α-helical peptides adsorbed onto a single walled carbon nanotube',
    description:
      'A research article detailing the use of classical molecular dynamics to analyze how the structure of α-helical peptides changes when they interact with carbon nanotubes, a topic with applications in bionanotechnology.'
  }
]);

export const projects = Object.freeze([
  {
    id: 'proj1',
    title: 'AI-Powered Production Rate Prediction',
    description:
      'Developed a machine learning model to predict the production rate of critical assets, enabling proactive adjustments and improving overall output.'
  },
  {
    id: 'proj2',
    title: 'Unburnt Fuel Prediction Inside Furnace Chambers',
    description:
      'A predictive model that identifies conditions leading to unburnt fuel in furnaces, preventing safety incidents and optimizing fuel efficiency.'
  },
  {
    id: 'proj3',
    title: 'Corrosion Prediction using Drone Images',
    description:
      'Utilized computer vision and machine learning to analyze drone imagery, automatically detecting and predicting corrosion on industrial equipment.'
  },
  {
    id: 'proj4',
    title: 'Service Level Prediction Platform',
    description:
      'Developed an AI platform that forecasts service level performance to help with capacity planning and ensuring customer satisfaction.'
  },
  {
    id: 'proj5',
    title: 'Fraud Detection API',
    description:
      'A microservice API that uses a combination of supervised and unsupervised learning to identify and flag fraudulent transactions in a large financial dataset.'
  }
]);

export const contextOptions = Object.freeze({ publications, projects });
