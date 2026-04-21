import requests, time
urls = [
    'https://services1.arcgis.com/KHyU64FWGq6mvNri/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0',
    'https://services1.arcgis.com/JoAFXwlKHLyOd6vo/arcgis/rest/services/Florida_Statewide_Parcels/FeatureServer/0'
]
bbox = '{"xmin":-82.465,"ymin":27.945,"xmax":-82.455,"ymax":27.955,"spatialReference":{"wkid":4326}}'
headers = {'User-Agent': 'Mozilla/5.0'}
params = {
    'where': '1=1', 'outFields': '*', 'f': 'geojson', 'geometry': bbox,
    'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'outSR': '4326',
    'spatialRel': 'esriSpatialRelIntersects', 'resultRecordCount': 5
}
for url in urls:
    print(f'Testing URL: {url}')
    try:
        r = requests.get(url + '/query', params=params, headers=headers, timeout=20)
        if r.status_code == 200:
            data = r.json()
            feats = data.get('features', [])
            keys = list(feats[0].get('properties', {}).keys()) if feats else []
            print(f'  Status 200, Features: {len(feats)}, Keys: {keys}')
        else:
            print(f'  Status {r.status_code}, Resp: {r.text[:100]}')
    except Exception as e:
        print(f'  Exception {type(e).__name__}')
    print('-' * 40)
