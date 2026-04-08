import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

describe('RCS Manifest Validation', () => {
  let ajv: Ajv;
  let validate: any;
  let schemaFound = false;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true, strict: false });
    
    // Attempt to load the spec schema from the local spec repo or a relative path
    const schemaPathLocal = path.resolve(__dirname, '../../spec/radzor-manifest.schema.json');
    let schema;

    if (fs.existsSync(schemaPathLocal)) {
      schema = JSON.parse(fs.readFileSync(schemaPathLocal, 'utf8'));
      schemaFound = true;
    } else {
      console.warn('⚠️ RCS Schema not found locally. Ensure the "spec" repository is available.');
      // Fallback or skip
      return;
    }

    validate = ajv.compile(schema);
  });

  it('Should have the RCS spec schema available', () => {
    expect(schemaFound).toBe(true);
  });

  const componentsDir = path.resolve(__dirname, '../');
  const components = fs.readdirSync(componentsDir).filter(f => {
    const isDir = fs.statSync(path.join(componentsDir, f)).isDirectory();
    const hasManifest = fs.existsSync(path.join(componentsDir, f, 'radzor.manifest.json'));
    return isDir && hasManifest;
  });

  components.forEach(component => {
    it(`should validate manifest for component: ${component}`, () => {
      const manifestPath = path.join(componentsDir, component, 'radzor.manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      const isValid = validate(manifest);
      
      if (!isValid) {
        console.error(`Validation errors in ${component}:`, validate.errors);
      }
      
      expect(isValid).toBe(true);
    });
  });
});