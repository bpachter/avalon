# Public Data Sources

All datasets below are publicly available without paid subscriptions.
Refresh cadences are guidance — if a source is updated more often,
the ingest layer can simply pull more frequently.

| Factor | Dataset | Provider | Format | License | Refresh |
|--------|---------|----------|--------|---------|---------|
| power_transmission | Electric Power Transmission Lines (filter VOLTAGE≥230) | HIFLD Open Data | GeoJSON / shapefile | Public domain | Quarterly |
| power_transmission | Electric Substations | HIFLD | GeoJSON / shapefile | Public domain | Quarterly |
| power_transmission | Form 715 transmission planning models | FERC | XML/CSV (per filer) | Public | Annual |
| power_transmission | Generator Interconnection Queues | PJM/ERCOT/MISO/SPP/CAISO/NYISO/ISO-NE | CSV/XLS | Public | Monthly |
| power_cost | Form 861 industrial retail tariffs | EIA | CSV | Public | Annual + monthly updates |
| power_cost | Real-time + day-ahead LMP | ISO/RTO data feeds | CSV/JSON (varies) | Public | Hourly |
| power_carbon | Form 930 BA generation mix | EIA | JSON via EIA API v2 | Public | Hourly |
| power_carbon | eGRID emission factors | EPA | XLSX | Public | Annual (lag 1–2 yrs) |
| gas_pipeline | Natural Gas Interstate/Intrastate Pipelines | HIFLD | GeoJSON / shapefile | Public domain | Quarterly |
| gas_pipeline | Natural Gas Pipelines GIS | EIA | shapefile | Public | Annual |
| fiber | Long-haul Fiber Optic Cables | HIFLD | GeoJSON / shapefile | Public domain | Quarterly |
| fiber | Form 477 / Broadband Data Collection | FCC | CSV | Public | Semi-annual |
| fiber | Internet Exchange + Facility geocodes | PeeringDB | REST JSON | CC BY 4.0 | On demand |
| water | National Water Information System (NWIS) | USGS | REST JSON / RDB | Public | Real-time |
| water | U.S. Drought Monitor | NDMC / NOAA / USDA | shapefile / GeoJSON | Public | Weekly |
| water | State water-rights databases | TX TCEQ, AZ ADWR, NV NDWR, CA SWRCB, … | varies | Public | Varies |
| climate | Hourly observations + 1991–2020 normals | NOAA NCEI | CSV / NetCDF | Public | Hourly / Annual |
| climate | TMY (Typical Meteorological Year) | NREL / ASHRAE | CSV | Public | Periodic |
| hazard | National Flood Hazard Layer (NFHL) | FEMA | shapefile / WMS | Public | Continuous |
| hazard | National Seismic Hazard Map | USGS | raster + WMS | Public | Periodic (current: 2023) |
| hazard | Wildfire Hazard Potential | USFS | raster | Public | Periodic |
| hazard | Tornado climatology | NOAA SPC | CSV / shapefile | Public | Annual |
| hazard | Hurricane wind zones | NOAA NHC | shapefile | Public | Periodic |
| land_zoning | County parcel + zoning | County GIS portals | varies | Varies (mostly public) | Varies |
| land_zoning | Brownfields | EPA | CSV / GIS | Public | Continuous |
| land_zoning | 3DEP DEM | USGS | GeoTIFF | Public | Periodic |
| tax_incentives | Opportunity Zone tracts | IRS / Treasury | shapefile | Public | Static (2018) |
| tax_incentives | State commerce dept incentive registries | State agencies | varies | Public | As-published |
| permitting | County permit portals | County agencies | varies | Public | Continuous |
| permitting | State PUC dockets | State PUCs | XML / HTML | Public | Continuous |
| latency | IXP + facility geocodes | PeeringDB | REST JSON | CC BY 4.0 | On demand |
| latency | Hyperscaler region maps | AWS / Azure / GCP / OCI | HTML / JSON | Public | Continuous |
| labor | QCEW | BLS | CSV / API | Public | Quarterly |
| labor | OEWS | BLS | XLSX / API | Public | Annual |
| labor | ACS commuting flows | Census | CSV | Public | Annual |
| community | County minutes | County agencies | PDF / HTML | Public | Continuous |
| community | News graph | Tavily / RSS | JSON | Per provider TOS | Continuous |
