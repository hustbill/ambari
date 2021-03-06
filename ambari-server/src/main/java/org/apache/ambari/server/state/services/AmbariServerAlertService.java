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
package org.apache.ambari.server.state.services;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import org.apache.ambari.server.AmbariService;
import org.apache.ambari.server.controller.RootServiceResponseFactory.Components;
import org.apache.ambari.server.controller.RootServiceResponseFactory.Services;
import org.apache.ambari.server.orm.dao.AlertDefinitionDAO;
import org.apache.ambari.server.orm.entities.AlertDefinitionEntity;
import org.apache.ambari.server.state.Cluster;
import org.apache.ambari.server.state.Clusters;
import org.apache.ambari.server.state.alert.AlertDefinition;
import org.apache.ambari.server.state.alert.AlertDefinitionFactory;
import org.apache.ambari.server.state.alert.ServerSource;
import org.apache.ambari.server.state.alert.SourceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.common.util.concurrent.AbstractScheduledService;
import com.google.inject.Inject;
import com.google.inject.Injector;
import com.google.inject.Provider;

/**
 * The {@link AmbariServerAlertService} is used to manage the dynamically loaded
 */
@AmbariService
public class AmbariServerAlertService extends AbstractScheduledService {

  /**
   * Logger.
   */
  private final static Logger LOG = LoggerFactory.getLogger(AmbariServerAlertService.class);

  /**
   * Used to inject the constructed {@link Runnable}s.
   */
  @Inject
  private Injector m_injector;

  /**
   * Used for looking up alert definitions.
   */
  @Inject
  private AlertDefinitionDAO m_dao;

  /**
   * Used to get alert definitions to use when generating alert instances.
   */
  @Inject
  private Provider<Clusters> m_clustersProvider;

  /**
   * Used to coerce {@link AlertDefinitionEntity} into {@link AlertDefinition}.
   */
  @Inject
  private AlertDefinitionFactory m_alertDefinitionFactory;

  /**
   * The executor to use to run all {@link Runnable} alert classes.
   */
  private final ScheduledExecutorService m_scheduledExecutorService = Executors.newScheduledThreadPool(3);

  /**
   * A map of all of the definition names to {@link ScheduledFuture}s.
   */
  private final Map<String, ScheduledAlert> m_futureMap = new ConcurrentHashMap<String, ScheduledAlert>();

  /**
   * Constructor.
   *
   */
  public AmbariServerAlertService() {
  }

  /**
   * {@inheritDoc}
   */
  @Override
  protected Scheduler scheduler() {
    return Scheduler.newFixedDelaySchedule(1, 1, TimeUnit.MINUTES);
  }

  /**
   * {@inheritDoc}
   * <p/>
   * Loads all of the {@link Components#AMBARI_SERVER} definitions and schedules
   * the ones that are enabled.
   */
  @Override
  protected void startUp() throws Exception {
    Map<String, Cluster> clusterMap = m_clustersProvider.get().getClusters();
    for (Cluster cluster : clusterMap.values()) {
      List<AlertDefinitionEntity> entities = m_dao.findByServiceComponent(
          cluster.getClusterId(), Services.AMBARI.name(),
          Components.AMBARI_SERVER.name());

      for (AlertDefinitionEntity entity : entities) {
        // don't schedule disabled alert definitions
        if (!entity.getEnabled()) {
          continue;
        }

        SourceType sourceType = entity.getSourceType();
        if (sourceType != SourceType.SERVER) {
          continue;
        }

        // schedule the Runnable for the definition
        scheduleRunnable(entity);
      }
    }
  }

  /**
   * {@inheritDoc}
   * <p/>
   * Compares all known {@link Components#AMBARI_SERVER} alerts with those that
   * are scheduled. If any are not scheduled or have their intervals changed,
   * then reschedule those.
   */
  @Override
  protected void runOneIteration() throws Exception {
    Map<String, Cluster> clusterMap = m_clustersProvider.get().getClusters();
    for (Cluster cluster : clusterMap.values()) {
      // get all of the cluster alerts for the server
      List<AlertDefinitionEntity> entities = m_dao.findByServiceComponent(
          cluster.getClusterId(), Services.AMBARI.name(),
          Components.AMBARI_SERVER.name());

      // for each alert, check to see if it's scheduled correctly
      for (AlertDefinitionEntity entity : entities) {
        String definitionName = entity.getDefinitionName();
        ScheduledAlert scheduledAlert = m_futureMap.get(definitionName);
        ScheduledFuture<?> scheduledFuture = scheduledAlert.getScheduledFuture();

        // if the definition is not enabled, ensure it's not scheduled and
        // then continue to the next one
        if (!entity.getEnabled()) {
          unschedule(definitionName, scheduledFuture);
          continue;
        }

        // if there is no future, then schedule it
        if (null == scheduledFuture) {
          scheduleRunnable(entity);
          continue;
        }

        // compare the delay of the future to the definition; if they don't
        // match then reschedule this definition
        int scheduledInterval = scheduledAlert.getInterval();
        if (scheduledInterval != entity.getScheduleInterval()) {
          // unschedule
          unschedule(definitionName, scheduledFuture);

          // reschedule
          scheduleRunnable(entity);
        }
      }
    }
  }

  /**
   * Invokes {@link ScheduledFuture#cancel(boolean)} and removes the mapping
   * from {@link #m_futureMap}. Does nothing if the future is not scheduled.
   *
   * @param scheduledFuture
   */
  private void unschedule(String definitionName,
      ScheduledFuture<?> scheduledFuture) {
    scheduledFuture.cancel(true);
    m_futureMap.remove(definitionName);

    LOG.info("Unscheduled server alert {}", definitionName);
  }

  /**
   * Schedules the {@link Runnable} referenced by the
   * {@link AlertDefinitionEntity} to run at a fixed interval.
   *
   * @param entity
   *          the entity to schedule the runnable for (not {@code null}).
   * @throws ClassNotFoundException
   * @throws IllegalAccessException
   * @throws InstantiationException
   */
  private void scheduleRunnable(AlertDefinitionEntity entity)
      throws ClassNotFoundException,
      IllegalAccessException, InstantiationException {

    // if the definition is disabled, do nothing
    if (!entity.getEnabled()) {
      return;
    }

    AlertDefinition definition = m_alertDefinitionFactory.coerce(entity);
    ServerSource serverSource = (ServerSource) definition.getSource();
    String sourceClass = serverSource.getSourceClass();
    int interval = definition.getInterval();

    try {
      Class<?> clazz = Class.forName(sourceClass);
      if (!Runnable.class.isAssignableFrom(clazz)) {
        LOG.warn(
            "Unable to schedule a server side alert for {} because it is not a Runnable",
            sourceClass);
        return;
      }

      // instantiate and inject
      Runnable runnable = (Runnable) clazz.newInstance();
      m_injector.injectMembers(runnable);

      // schedule the runnable alert
      ScheduledFuture<?> scheduledFuture = m_scheduledExecutorService.scheduleWithFixedDelay(
          runnable, interval, interval, TimeUnit.MINUTES);

      String definitionName = entity.getDefinitionName();
      ScheduledAlert scheduledAlert = new ScheduledAlert(scheduledFuture, interval);
      m_futureMap.put(definitionName, scheduledAlert);

      LOG.info("Scheduled server alert {} to run every {} minutes",
          definitionName, interval);

    } catch (ClassNotFoundException cnfe) {
      LOG.warn(
          "Unable to schedule a server side alert for {} because it could not be found in the classpath",
          sourceClass);
    }
  }

  /**
   * The {@link ScheduledAlert} class is used as a way to encapsulate a
   * {@link ScheduledFuture} with the interval it was scheduled with.
   */
  private static final class ScheduledAlert {
    private final ScheduledFuture<?> m_scheduledFuture;
    private final int m_interval;


    /**
     * Constructor.
     *
     * @param scheduledFuture
     * @param interval
     */
    private ScheduledAlert(ScheduledFuture<?> scheduledFuture, int interval) {

      m_scheduledFuture = scheduledFuture;
      m_interval = interval;
    }

    /**
     * @return the scheduledFuture
     */
    private ScheduledFuture<?> getScheduledFuture() {
      return m_scheduledFuture;
    }

    /**
     * @return the interval
     */
    private int getInterval() {
      return m_interval;
    }
  }
}
