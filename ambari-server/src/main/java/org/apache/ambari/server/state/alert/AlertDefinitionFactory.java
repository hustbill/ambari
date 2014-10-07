/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.ambari.server.state.alert;

import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Type;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.UUID;

import org.apache.ambari.server.AmbariException;
import org.apache.ambari.server.orm.entities.AlertDefinitionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonDeserializationContext;
import com.google.gson.JsonDeserializer;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import com.google.inject.Singleton;

/**
 * The {@link AlertDefinitionFactory} class is used to construct
 * {@link AlertDefinition} instances from a variety of sources.
 */
@Singleton
public class AlertDefinitionFactory {
  /**
   * Logger.
   */
  private final static Logger LOG = LoggerFactory.getLogger(AlertDefinitionFactory.class);

  /**
   * Builder used for type adapter registration.
   */
  private final GsonBuilder m_builder = new GsonBuilder();

  /**
   * Thread safe deserializer.
   */
  private final Gson m_gson;

  /**
   * Constructor.
   */
  public AlertDefinitionFactory() {
    m_builder.registerTypeAdapter(Source.class,
        new AlertDefinitionSourceAdapter());

    m_gson = m_builder.create();
  }

  /**
   * Gets a list of all of the alert definitions defined in the specified JSON
   * {@link File} for the given service.
   *
   * @param alertDefinitionFile
   * @param serviceName
   * @return
   * @throws AmbariException
   *           if there was a problem reading the file or parsing the JSON.
   */
  public Set<AlertDefinition> getAlertDefinitions(File alertDefinitionFile,
      String serviceName) throws AmbariException {
    Map<String,List<AlertDefinition>> definitionMap = null;

    try {
      Type type = new TypeToken<Map<String, List<AlertDefinition>>>(){}.getType();

      definitionMap = m_gson.fromJson(new FileReader(alertDefinitionFile), type);
    } catch (Exception e) {
      LOG.error("Could not read the alert definition file", e);
      throw new AmbariException("Could not read alert definition file", e);
    }

    Set<AlertDefinition> definitions = new HashSet<AlertDefinition>();
    for (Entry<String, List<AlertDefinition>> entry : definitionMap.entrySet()) {
      for (AlertDefinition ad : entry.getValue()) {
        ad.setServiceName(serviceName);
        if (!entry.getKey().equals("service")) {
          ad.setComponentName(entry.getKey());
        }
      }
      definitions.addAll(entry.getValue());
    }

    return definitions;
  }

  /**
   * Gets an {@link AlertDefinition} constructed from the specified
   * {@link AlertDefinitionEntity}.
   *
   * @param entity
   *          the entity to use to construct the {@link AlertDefinition} (not
   *          {@code null}).
   * @return the definiion or {@code null} if it could not be coerced.
   */
  public AlertDefinition coerce(AlertDefinitionEntity entity) {
    if (null == entity) {
      return null;
    }

    AlertDefinition definition = new AlertDefinition();
    definition.setClusterId(entity.getClusterId());
    definition.setComponentName(entity.getComponentName());
    definition.setEnabled(entity.getEnabled());
    definition.setInterval(entity.getScheduleInterval());
    definition.setName(entity.getDefinitionName());
    definition.setScope(entity.getScope());
    definition.setServiceName(entity.getServiceName());
    definition.setLabel(entity.getLabel());
    definition.setUuid(entity.getHash());

    try{
      String sourceJson = entity.getSource();
      Source source = m_gson.fromJson(sourceJson, Source.class);
      definition.setSource(source);
    } catch (Exception exception) {
      LOG.error(
          "Unable to deserialize the alert definition source during coercion",
          exception);

      return null;
    }

    return definition;
  }

  /**
   * Gets an {@link AlertDefinitionEntity} constructed from the specified
   * {@link AlertDefinition}.
   * <p/>
   * The new entity will have a UUID already set.
   *
   * @param clusterId
   *          the ID of the cluster.
   * @param definition
   *          the definition to use to construct the
   *          {@link AlertDefinitionEntity} (not {@code null}).
   * @return the definiion or {@code null} if it could not be coerced.
   */
  public AlertDefinitionEntity coerce(long clusterId, AlertDefinition definition) {
    if (null == definition) {
      return null;
    }

    AlertDefinitionEntity entity = new AlertDefinitionEntity();
    entity.setClusterId(clusterId);
    return merge(definition, entity);
  }

  /**
   * Merges the specified {@link AlertDefinition} into the
   * {@link AlertDefinitionEntity}, leaving any fields not merged intact.
   * <p/>
   * The merged entity will have a new UUID.
   *
   * @param definition
   *          the definition to merge into the entity (not {@code null}).
   * @param entity
   *          the entity to merge into (not {@code null}).
   * @return a merged, but not yes persisted entity, or {@code null} if the
   *         merge could not be done.
   */
  public AlertDefinitionEntity merge(AlertDefinition definition,
      AlertDefinitionEntity entity) {

    entity.setComponentName(definition.getComponentName());
    entity.setDefinitionName(definition.getName());
    entity.setEnabled(definition.isEnabled());
    entity.setHash(UUID.randomUUID().toString());
    entity.setLabel(definition.getLabel());
    entity.setScheduleInterval(definition.getInterval());
    entity.setServiceName(definition.getServiceName());

    Scope scope = definition.getScope();
    if (null == scope) {
      scope = Scope.ANY;
    }

    entity.setScope(scope);

    Source source = definition.getSource();
    entity.setSourceType(source.getType());

    try {
      String sourceJson = m_gson.toJson(source);
      entity.setSource(sourceJson);
    } catch (Exception exception) {
      LOG.error(
          "Unable to serialize the alert definition source during coercion",
          exception);

      return null;
    }

    return entity;
  }

  /**
   * Gets an instance of {@link Gson} that can correctly serialize and
   * deserialize an {@link AlertDefinition}.
   *
   * @return a {@link Gson} instance (not {@code null}).
   */
  public Gson getGson() {
    return m_gson;
  }

  /**
   * Deserializes {@link Source} implementations.
   */
  private static final class AlertDefinitionSourceAdapter implements JsonDeserializer<Source>{
    /**
     *
     */
    @Override
    public Source deserialize(JsonElement json, Type typeOfT,
        JsonDeserializationContext context) throws JsonParseException {
      JsonObject jsonObj = (JsonObject) json;

      SourceType type = SourceType.valueOf(jsonObj.get("type").getAsString());
      Class<? extends Source> clazz = null;

      switch (type) {
        case METRIC:{
          clazz = MetricSource.class;
          break;
        }
        case PORT:{
          clazz = PortSource.class;
          break;
        }
        case SCRIPT: {
          clazz = ScriptSource.class;
          break;
        }
        case AGGREGATE: {
          clazz = AggregateSource.class;
          break;
        }
        case PERCENT: {
          clazz = PercentSource.class;
          break;
        }
        default:
          break;
      }

      if (null == clazz) {
        LOG.warn(
            "Unable to deserialize an alert definition with source type {}",
            type);
        return null;
      }

      return context.deserialize(json, clazz);
    }
  }
}
